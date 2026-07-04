import pytest
from app.services.llm_service import LLMService

def test_extract_openscad_code_simple():
    text = "Here is a cube:\n```openscad\ncube([10, 10, 10]);\n```"
    assert LLMService._extract_openscad_code(text) == "cube([10, 10, 10]);"

def test_extract_openscad_code_scad_tag():
    text = "Here is a sphere:\n```scad\nsphere(r=5);\n```"
    assert LLMService._extract_openscad_code(text) == "sphere(r=5);"

def test_extract_openscad_code_no_tag():
    text = "Check this out:\n```\ndifference() {\n  cube(10);\n  sphere(5);\n}\n```"
    assert LLMService._extract_openscad_code(text) == "difference() {\n  cube(10);\n  sphere(5);\n}"

def test_extract_openscad_code_multiple_blocks():
    text = """
Block 1:
```openscad
cube(10);
```
Block 2 (longer):
```openscad
union() {
    cube(10);
    translate([10,0,0]) sphere(5);
}
```
"""
    # Should pick the longest one
    assert "union()" in LLMService._extract_openscad_code(text)

def test_extract_openscad_code_raw_fallback():
    text = "translate([0,0,10]) cube(20);"
    # Heuristic should pick it up as it contains translate and cube
    assert LLMService._extract_openscad_code(text) == "translate([0,0,10]) cube(20);"

def test_extract_openscad_code_non_scad_fence():
    text = "Here is some python:\n```python\nprint('hello')\n```\nAnd some SCAD:\n```\ncube(5);\n```"
    assert LLMService._extract_openscad_code(text) == "cube(5);"
