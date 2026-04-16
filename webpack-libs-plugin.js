#!/usr/bin/env node

import { exec, execFile } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { globIterate as fsGlob } from 'glob';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/** Git Bash path for Unix utilities (unzip, zip, find) on Windows. */
function findGitBash() {
    const bases = [
        process.env.PROGRAMFILES,
        process.env['PROGRAMFILES(X86)'],
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : null,
    ].filter(Boolean);

    for (const base of bases) {
        const candidate = path.join(base, 'Git', 'bin', 'bash.exe');
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

/** Resolve to a path Git Bash understands (e.g. /c/Users/.../proj). */
function toUnixPathForBash(p) {
    const resolved = path.resolve(p);
    if (process.platform !== 'win32') {
        return resolved;
    }
    const normalized = resolved.replace(/\//g, '\\');
    const m = normalized.match(/^([A-Za-z]):\\(.*)$/);
    if (m) {
        return `/${m[1].toLowerCase()}/${m[2].split('\\').join('/')}`;
    }
    return normalized.split('\\').join('/');
}

/**
 * Run a Unix shell snippet (find, zip, unzip, rm). On Windows uses Git Bash so
 * the same commands work as on Linux/macOS.
 */
async function execUnixShell(command, options = {}) {
    const cwd = options.cwd ?? process.cwd();
    if (process.platform !== 'win32') {
        return execAsync(command, { ...options, cwd });
    }
    const bash = findGitBash();
    if (!bash) {
        throw new Error(
            'On Windows, npm run build:libs needs Git for Windows so `unzip` is available for the WASM bundle (Git usr/bin). ' +
                'Install from https://git-scm.com/download/win or add bash.exe under LOCALAPPDATA\\Programs\\Git.'
        );
    }
    const gitRoot = path.resolve(path.dirname(bash), '..');
    const mingwBin = toUnixPathForBash(path.join(gitRoot, 'mingw64', 'bin'));
    const usrBin = toUnixPathForBash(path.join(gitRoot, 'usr', 'bin'));
    const pathPrefix = `export PATH="${mingwBin}:${usrBin}:$PATH" && `;
    return execFileAsync(bash, ['-lc', pathPrefix + command], { ...options, cwd });
}

function posixPath(p) {
    return p.split(path.sep).join('/');
}

/** Mirrors libs find excludes (paths under a "tests" directory). */
function isExcluded(relPosix, excludes) {
    if (!excludes?.length) {
        return false;
    }
    const n = relPosix.replace(/\\/g, '/');
    for (const ex of excludes) {
        if (ex.includes('tests')) {
            if (n.includes('/tests/') || n.startsWith('tests/')) {
                return true;
            }
        }
    }
    return false;
}

function classifyInclude(pattern) {
    if (pattern.startsWith('../')) {
        return { kind: 'parent', pattern };
    }
    if (pattern.includes('**')) {
        return { kind: 'glob', globs: [pattern] };
    }
    if (pattern.includes('*')) {
        if (pattern === '*.scad') {
            return { kind: 'glob', globs: ['**/*.scad'] };
        }
        return { kind: 'glob', globs: [pattern] };
    }
    return { kind: 'literal', pattern };
}

async function collectMatchesForInclude(fullSourceDir, pattern, excludes, map) {
    const spec = classifyInclude(pattern);
    if (spec.kind === 'parent') {
        const abs = path.normalize(path.join(fullSourceDir, spec.pattern));
        if (!existsSync(abs)) {
            return;
        }
        const st = await fs.stat(abs);
        if (!st.isFile()) {
            return;
        }
        const relKey = posixPath(path.relative(fullSourceDir, abs));
        if (!isExcluded(relKey, excludes)) {
            map.set(relKey, abs);
        }
        return;
    }
    if (spec.kind === 'glob') {
        for (const g of spec.globs) {
            for await (const rel of fsGlob(g, { cwd: fullSourceDir, nodir: true })) {
                const relKey = posixPath(rel);
                if (!isExcluded(relKey, excludes)) {
                    map.set(relKey, path.join(fullSourceDir, rel));
                }
            }
        }
        return;
    }
    const lit = spec.pattern;
    const abs = path.join(fullSourceDir, lit);
    const st = await fs.stat(abs).catch(() => null);
    if (!st) {
        return;
    }
    if (st.isFile()) {
        const relKey = posixPath(lit);
        if (!isExcluded(relKey, excludes)) {
            map.set(relKey, abs);
        }
        return;
    }
    if (st.isDirectory()) {
        const treeGlob = `${lit.replace(/\\/g, '/')}/**/*`;
        for await (const rel of fsGlob(treeGlob, { cwd: fullSourceDir, nodir: true })) {
            const relKey = posixPath(rel);
            if (!isExcluded(relKey, excludes)) {
                map.set(relKey, path.join(fullSourceDir, rel));
            }
        }
    }
}

async function writeZipFromFileMap(outputPath, map) {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const [rel, abs] of map) {
        zip.file(rel, await fs.readFile(abs));
    }
    const buf = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buf);
}

class OpenSCADLibrariesPlugin {
    constructor(options = {}) {
        this.configFile = options.configFile || 'libs-config.json';
        this.libsDir = options.libsDir || 'libs';
        this.publicLibsDir = options.publicLibsDir || 'public/libraries';
        this.srcWasmDir = options.srcWasmDir || 'src/wasm';
        this.buildMode = options.buildMode || 'all'; // 'all', 'wasm', 'fonts', 'libs'
        this.config = null;
    }

    apply(compiler) {
        const pluginName = 'OpenSCADLibrariesPlugin';

        compiler.hooks.beforeRun.tapAsync(pluginName, async (_, callback) => {
            try {
                await this.loadConfig();

                switch (this.buildMode) {
                    case 'all':
                        await this.buildAll();
                        break;
                    case 'wasm':
                        await this.buildWasm();
                        break;
                    case 'fonts':
                        await this.buildFonts();
                        break;
                    case 'libs':
                        await this.buildAllLibraries();
                        break;
                    case 'clean':
                        await this.clean();
                        break;
                }

                callback();
            } catch (error) {
                callback(error);
            }
        });
    }

    async loadConfig() {
        try {
            const configContent = await fs.readFile(this.configFile, 'utf-8');
            this.config = JSON.parse(configContent);
        } catch (error) {
            throw new Error(`Failed to load config from ${this.configFile}: ${error.message}`);
        }
    }

    async ensureDir(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async downloadFile(url, outputPath) {
        console.log(`Downloading ${url} to ${outputPath}`);

        return new Promise((resolve, reject) => {
            https.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    return this.downloadFile(response.headers.location, outputPath)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }

                const fileStream = createWriteStream(outputPath);
                pipeline(response, fileStream)
                    .then(resolve)
                    .catch(reject);
            }).on('error', reject);
        });
    }

    async cloneRepo(repo, targetDir, branch = 'master', shallow = true) {
        const cloneArgs = [
            'clone',
            '--recurse',
            shallow ? '--depth 1' : '',
            `--branch ${branch}`,
            '--single-branch',
            repo,
            targetDir
        ].filter(Boolean);

        console.log(`Cloning ${repo} to ${targetDir}`);
        try {
            await execAsync(`git ${cloneArgs.join(' ')}`);
        } catch (error) {
            console.error(`Failed to clone ${repo}:`, error.message);
            throw error;
        }
    }

    async createZip(sourceDir, outputPath, includes = [], excludes = [], workingDir = '.') {
        await this.ensureDir(path.dirname(outputPath));

        const fullSourceDir = path.join(sourceDir, workingDir);
        const includeList = includes.length > 0 ? includes : ['*.scad'];
        const map = new Map();

        for (const pattern of includeList) {
            await collectMatchesForInclude(fullSourceDir, pattern, excludes, map);
        }

        console.log(`Creating zip: ${outputPath}`);
        try {
            await writeZipFromFileMap(path.resolve(outputPath), map);
        } catch (error) {
            console.error(`Failed to create zip ${outputPath}:`, error.message);
            throw error;
        }
    }

    async buildWasm() {
        const { wasmBuild } = this.config;
        const wasmDir = wasmBuild.target;
        const wasmZip = `${wasmDir}.zip`;

        await this.ensureDir(this.libsDir);

        if (!existsSync(wasmDir)) {
            await this.ensureDir(wasmDir);
            await this.downloadFile(wasmBuild.url, wasmZip);

            console.log(`Extracting WASM to ${wasmDir}`);
            await execUnixShell(`cd "${toUnixPathForBash(wasmDir)}" && unzip "${toUnixPathForBash(wasmZip)}"`);
        }

        await this.ensureDir('public');

        const jsTarget = 'public/openscad.js';
        const wasmTarget = 'public/openscad.wasm';

        // Remove existing symlinks/files
        try {
            await fs.unlink(jsTarget);
        } catch { /* ignore */ }
        try {
            await fs.unlink(wasmTarget);
        } catch { /* ignore */ }

        const wasmJs = path.join(wasmDir, 'openscad.js');
        const wasmBin = path.join(wasmDir, 'openscad.wasm');

        if (process.platform === 'win32') {
            await fs.copyFile(wasmJs, jsTarget);
            await fs.copyFile(wasmBin, wasmTarget);
        } else {
            await fs.symlink(path.relative('public', wasmJs), jsTarget);
            await fs.symlink(path.relative('public', wasmBin), wasmTarget);
        }

        // Create src/wasm link (junction on Windows avoids symlink privilege issues)
        try {
            await fs.unlink(this.srcWasmDir);
        } catch { /* ignore */ }
        if (process.platform === 'win32') {
            await fs.symlink(path.resolve(wasmDir), this.srcWasmDir, 'junction');
        } else {
            await fs.symlink(path.relative('src', wasmDir), this.srcWasmDir);
        }

        console.log('WASM setup completed');
    }

    async buildFonts() {
        const { fonts } = this.config;
        const notoDir = path.join(this.libsDir, 'noto');
        const liberationDir = path.join(this.libsDir, 'liberation');

        await this.ensureDir(notoDir);

        // Download Noto fonts
        for (const font of fonts.notoFonts) {
            const fontPath = path.join(notoDir, font);
            if (!existsSync(fontPath)) {
                const url = fonts.notoBaseUrl + font;
                await this.downloadFile(url, fontPath);
            }
        }

        // Clone liberation fonts if not exists
        if (!existsSync(liberationDir)) {
            await this.cloneRepo(fonts.liberationRepo, liberationDir, fonts.liberationBranch);
        }

        // Create fonts.zip (flat layout like zip -j; pure Node so no zip binary is required)
        const fontsZip = path.join(this.publicLibsDir, 'fonts.zip');
        await this.ensureDir(this.publicLibsDir);

        console.log('Creating fonts.zip');
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        const fontConfPath = path.resolve('fonts.conf');
        zip.file('fonts.conf', await fs.readFile(fontConfPath));
        for (const name of await fs.readdir(notoDir)) {
            if (name.toLowerCase().endsWith('.ttf')) {
                zip.file(name, await fs.readFile(path.join(notoDir, name)));
            }
        }
        for (const name of await fs.readdir(liberationDir)) {
            if (name.toLowerCase().endsWith('.ttf')) {
                zip.file(name, await fs.readFile(path.join(liberationDir, name)));
            }
        }
        for (const name of ['LICENSE', 'AUTHORS']) {
            zip.file(name, await fs.readFile(path.join(liberationDir, name)));
        }
        const fontBuf = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
        });
        await fs.writeFile(fontsZip, fontBuf);

        console.log('Fonts setup completed');
    }

    async buildLibrary(library) {
        const libDir = path.join(this.libsDir, library.name);
        const zipPath = path.join(this.publicLibsDir, `${library.name}.zip`);

        // Clone repository if not exists
        if (!existsSync(libDir)) {
            await this.cloneRepo(library.repo, libDir, library.branch);
        }

        // Create zip
        await this.createZip(
            libDir,
            zipPath,
            library.zipIncludes || ['*.scad'],
            library.zipExcludes || [],
            library.workingDir || '.'
        );

        console.log(`Built ${library.name}`);
    }

    async buildAllLibraries() {
        await this.ensureDir(this.publicLibsDir);

        for (const library of this.config.libraries) {
            await this.buildLibrary(library);
        }
    }

    async clean() {
        console.log('Cleaning build artifacts...');

        const cleanPaths = [
            this.libsDir,
            'build',
            'public/openscad.js',
            'public/openscad.wasm',
            `${this.publicLibsDir}/*.zip`,
            this.srcWasmDir
        ];

        for (const cleanPath of cleanPaths) {
            try {
                if (cleanPath.includes('*')) {
                    const libDirOnly = path.dirname(cleanPath);
                    for await (const name of fsGlob('*.zip', { cwd: libDirOnly })) {
                        await fs.unlink(path.join(libDirOnly, name));
                    }
                } else {
                    await fs.rm(cleanPath, { recursive: true, force: true });
                }
            } catch {
                // Ignore errors for files that don't exist
            }
        }

        console.log('Clean completed');
    }

    async buildAll() {
        console.log('Building all libraries...');

        await this.buildWasm();
        await this.buildFonts();
        await this.buildAllLibraries();

        console.log('Build completed successfully!');
    }
}

export default OpenSCADLibrariesPlugin;
