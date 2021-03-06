'use strict';
import * as vscode from 'vscode';
import * as cp from 'child_process';

export function activate(context: vscode.ExtensionContext)
{
    console.log( "glsl-linter extension is now active" );

    // Create a linter class instance and its controller
    let linter = new GLSLLinter( );
    let linterController = new GLSLLinterController( linter );

    // Register the linter
    context.subscriptions.push( linter );
    context.subscriptions.push( linterController );
}

export function deactivate()
{
}

// Performs GLSL language linting
class GLSLLinter
{
    private diagnosticsCollection: vscode.DiagnosticCollection;

    constructor( )
    {
        this.diagnosticsCollection = vscode.languages.createDiagnosticCollection( );
    }

    // Does the actual linting
    public lint( doc : vscode.TextDocument )
    {
        // Only accept GLSL files
        if ( doc.languageId !== "glsl" )
        {
            return;
        }

        // Get configuration
        const config = vscode.workspace.getConfiguration( "glsl-linter" );
        if ( config.validatorPath === null  || config.validatorPath === ""  )
        {
            vscode.window.showErrorMessage( "GLSL Linter: glsl-linter.validatorPath must be set!" );
            return;
        }

        // Try to guess what type of shader we're editing based on file extension
        let shaderStage : string = "";
        if ( config.fileExtensions !== null && typeof( config.fileExtensions ) === "object" )
        {
            for ( let ext in config.fileExtensions )
            {
                let shaderType = config.fileExtensions[ext];
                if ( doc.fileName.endsWith( ext ) )
                {
                    // If the guess would be ambiguous, do not guess
                    if ( shaderStage === "" )
                    {
                        shaderStage = shaderType;
                    }
                    else
                    {
                        shaderStage = "";
                        vscode.window.showWarningMessage( "GLSL Linter: current file extension matches at least two shader types!" );
                    }
                }
            }
        }

        // These are diagnostic messages for this file
        let diagnostics : vscode.Diagnostic[] = [];

        // Validator arguments
        let validatorArguments = [doc.fileName];
        if ( shaderStage !== "" )
        {
            validatorArguments = validatorArguments.concat( ["-S", shaderStage ] );
        }

        // Extra arguments are prepended
        const extraValidatorArguments = config.validatorArgs;
        if (extraValidatorArguments !== null && Array.isArray(extraValidatorArguments))
        {
            validatorArguments = validatorArguments.concat(extraValidatorArguments);
        }

        // DEBUG
        // console.log( validatorArguments.join( "|" ) );

        // Spawn the validator process
        let validatorProcess = cp.spawn(
                config.validatorPath,
                validatorArguments,
                {}
            );

        // If the validator is running
        if ( validatorProcess.pid )
        {
            let validatorOutput = "";
            validatorProcess.stdout.on( "data", ( data : Buffer ) => { validatorOutput += data; } );

            /*
             * It seems that glglangValidators returns 0 when there are no errors,
             * 1 if there's a problem with the invocation and 2 if there are compilation errors.
             * Therefore only exit code 1 is handled here.
             */
            validatorProcess.on( "exit", (code : Number) =>
            {
                // DEBUG
                // console.log("glslangValidator exit code: " + code);

                if (code == 1)
                {
                    vscode.window.showErrorMessage( "GLSL Linter: GLSL validator returned exit code 1!" );
                    return;
                }
            });

            // When validator finishes its job (closes stream)
            validatorProcess.stdout.on( "close", () =>
            {
                let lines = validatorOutput.toString( ).split( /(?:\r\n|\r|\n)/g );

                // DEBUG
                // console.log(validatorOutput.toString());
                // console.log(lines);

                // Run analysis for each output line
                lines.forEach( line =>
                {
                    // Skip empty lines
                    if ( line === "" )
                    {
                        return;
                    }

                    // Determine the severity of the error
                    let severity : vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Hint;
                    if ( line.startsWith( "ERROR:" ) )
                    {
                        severity = vscode.DiagnosticSeverity.Error;
                    }
                    else if ( line.startsWith( "WARNING:" ) )
                    {
                        severity = vscode.DiagnosticSeverity.Warning;
                    }


                    // Check if the line contained an error information
                    // Hint severity is used as "no error" here
                    if ( severity !== vscode.DiagnosticSeverity.Hint )
                    {
                        // Parse the error message (if columns are specified)
                        let matches = line.match( /WARNING:|ERROR:\s(\d*):(\d*): (.*)/ );
                        if ( matches && matches.length === 4 )
                        {
                            // Get the matched info
                            let lineNumber = parseInt( matches[2] ) - 1;
                            let message = matches[3];
                            let codeLine = lineNumber < doc.lineCount ? doc.lineAt( lineNumber ).text : "";
                            let precedingWhitespace = codeLine.search( /\S|$/ );
                            let lineLength = codeLine.length;

                            // Create a diagnostic message
                            let where = new vscode.Range(
                                lineNumber,
                                precedingWhitespace,
                                lineNumber,
                                lineLength
                            );
                            let diag = new vscode.Diagnostic( where, message, severity );
                            diagnostics.push( diag );
                        }
                        else
                        {
                            // Also handle global messages
                            matches = line.match( /WARNING:|ERROR: (.*)/ );
                            if ( matches && matches.length === 2 )
                            {
                                // DEBUG
                                // console.log("found global error");

                                // Get the matched info
                                let message = matches[1];

                                // Ignore those useless messages
                                if (message.endsWith("compilation errors.  No code generated."))
                                    return;

                                // Create a diagnostic message on the 1st char of the file
                                let where = new vscode.Range(0, 0, 0, 0);
                                let diag = new vscode.Diagnostic( where, message, severity );
                                diagnostics.push( diag );
                            }
                        }
                    }
                } );

                // After the output is processed, push the new diagnostics to collection
                this.diagnosticsCollection.set( doc.uri, diagnostics );
            } );
        }
        else
        {
            vscode.window.showErrorMessage( "GLSL Linter: failed to run GLSL validator!" );
            return;
        }
    }

    dispose( )
    {
        this.diagnosticsCollection.clear( );
        this.diagnosticsCollection.dispose( );
    }
}

// Controls the GLSLLinter class
class GLSLLinterController
{
    private _linter : GLSLLinter; // Associated linter
    private _disposable : vscode.Disposable; // Some disposable stuff (?)

    // Creates a new linter controller
    constructor( linter : GLSLLinter )
    {
        this._linter = linter;

        let subscriptions : vscode.Disposable[] = [];

        // Linter triggers
        vscode.workspace.onDidOpenTextDocument( this.lintTrigger, this, subscriptions );
        vscode.workspace.onDidSaveTextDocument( this.lintTrigger, this, subscriptions );

        this._disposable = vscode.Disposable.from( ...subscriptions );
    }

    // Dispose method
    dispose( )
    {
        this._disposable.dispose( );
    }

    // Executed whenever linting shall be done
    private lintTrigger( )
    {
        let editor = vscode.window.activeTextEditor;
        if ( editor )
        {
            this._linter.lint( editor.document );
        }
    }
}
