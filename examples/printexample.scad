// --- Parameter ---
box_width  = 60;
box_length = 40;
box_height = 20;
wall_thick = 2.0;    // Wandstärke
corner_rad = 3;      // Abrundung der Ecken
tolerance  = 0.4;    // Passung Deckel/Boden (0.4-0.6mm ideal für Ender 3)
$fn = 64;            // Glattheit der Zylinder/Ecken

// --- Hauptmodell (Boden) ---
module case_bottom() {
    difference() {
        // Außenkörper
        minkowski() {
            cube([box_width - 2*corner_rad, box_length - 2*corner_rad, box_height], center=false);
            cylinder(r=corner_rad, h=0.1);
        }
        
        // Innenraum aushöhlen
        translate([wall_thick, wall_thick, wall_thick])
            minkowski() {
                cube([box_width - 2*wall_thick - 2*corner_rad, 
                      box_length - 2*wall_thick - 2*corner_rad, 
                      box_height], center=false);
                cylinder(r=corner_rad, h=0.1);
            }
        
        // --- Optional: Kabeldurchlass / Loch ---
        translate([box_width/2, -1, box_height/2])                
            rotate([-90,0,0])
            cylinder(d=5, h=wall_thick+2);
    }
}

// --- Deckel ---
module case_lid() {
    translate([0, box_length + 5, 0]) // Deckel zur Seite legen für Vorschau
    difference() {
        // Deckel Platte
        minkowski() {
            cube([box_width - 2*corner_rad, box_length - 2*corner_rad, wall_thick], center=false);
            cylinder(r=corner_rad, h=0.1);
        }
        
        // Schraubenlöcher im Deckel (Beispiel: 3mm)
        for(x = [5, box_width-5], y = [5, box_length-5]) {
            translate([x, y, -1]) 
                cylinder(d=3.2, h=wall_thick+2);
        }
    }
}

// --- Renders ---
case_bottom();
//case_lid(); // Zum Exportieren einzeln rendern!
