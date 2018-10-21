'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as cp from 'child_process';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log("vscode-glsl-linter is now active!");

    // Create a linter class instance and its controller
    let linter = new GLSLLinter( );
    let linterController = new GLSLLinterController( linter );

    // Register the linter
    context.subscriptions.push( linter );
    context.subscriptions.push( linterController );
}

// this method is called when your extension is deactivated
export function deactivate() {
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
    public lint( )
    {
        // Get editor environment
        let editor = vscode.window.activeTextEditor;
        if ( !editor )
        {
            return;
        }

        // Get document
        let doc = editor.document;

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

        // These are diagnostic messages for this file
        let diagnostics : vscode.Diagnostic[] = [];

        // TODO determine shader type based on config and extension

        // Spawn the validator process
        let validatorArguments = ["-S", "frag", doc.fileName];
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

            // When validator finishes its job
            validatorProcess.stdout.on( "end", () =>
            {
                let lines = validatorOutput.toString( ).split( /(?:\r\n|\r|\n)/g );

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
                        // Parse the error message
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
        this._linter.lint( );
    }
}