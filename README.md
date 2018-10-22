# GLSL Linter for VSCode

GLSL Linter provides linting capability for OpenGL shading language in VSCode.

<img src=https://i.imgur.com/CRejU4V.png height=300px>

## Requirements

This extension requires external GLSL reference compiler. You can find it [here](https://www.khronos.org/opengles/sdk/tools/Reference-Compiler/).

## Extension Settings
 * `glsl-linter.validatorPath` - path to the GLSL validator executable
 * `glsl-linter.fileExtensions` - assiciated file types along with abbreviated shader stage names (`vert`, `tesc`, `tese`, `geom`, `frag`, `comp`).

Example configuration:
```json
"glsl-linter.validatorPath": "/usr/local/bin/glslangValidator",
"glsl-linter.fileExtensions": {
	".fs.glsl": "frag",
	".vs.glsl": "vert",
	".tes.glsl": "tese",
	".tcs.glsl": "tesc",
	".gs.glsl": "geom"
}
```