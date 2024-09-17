import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// La función de activación es la entrada de tu extensión
export async function activate(context: vscode.ExtensionContext) {

    // Obtener la ruta del archivo de configuración usando globalStorageUri
    const configPath = path.join(context.globalStorageUri.fsPath, 'config.json');

    // Asegurarse de que el directorio existe
    if (!fs.existsSync(context.globalStorageUri.fsPath)) {
        fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
    }

    // Crear el archivo config.json si no existe con claves vacías
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ openaiApiKey: "", assistantId: "" }, null, 4));
    }

    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Uso de las funciones getApiKey y getAssistantId
    if (!config.openaiApiKey || !config.assistantId) {

        if (!config.openaiApiKey) {
            const apiKey = await getApiKey();
            if (apiKey) {
                config.openaiApiKey = apiKey;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
                vscode.window.showInformationMessage('API Key Set!');
            }
        }

        if (!config.assistantId) {
            const asstId = await getAssistantId();
            if (asstId) {
                config.assistantId = asstId;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
                vscode.window.showInformationMessage('Assistant ID Set!');
            }
        }
    }

    const client = new OpenAI({
        apiKey: config.openaiApiKey
    });

    const command = vscode.commands.registerCommand('extension.unittest', async () => {

        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage('No active editor. Please open a file with code you want to test.');
            return;
        }

        const selection = editor.selection;
        const userCode = editor.document.getText(selection);

        if (!userCode || userCode.trim() === '') {
            vscode.window.showInformationMessage('Please highlight the code you wish to test.');
            return;
        }

        // Crear el panel del chat después de capturar la selección
        const panel = vscode.window.createWebviewPanel(
            'chatPanel', // Identificador
            'Chat Assistant', // Título del panel
            vscode.ViewColumn.One, // Editor donde se mostrará el panel
            {} // Opciones del webview
        );

        panel.webview.html = getWebviewContent("");


        try {
            const thread = await client.beta.threads.create();
            panel.webview.html = getWebviewContent(`Thread started with ID: ${thread.id}`);
            panel.webview.html += `<div class="user-message"><strong>You:</strong><pre><code>${escapeHtml(userCode)}</code></pre></div>`;


            // Envía el código al asistente y continúa con el bucle
            await client.beta.threads.messages.create(thread.id, {
                role: "user",
                content: userCode
            });

            // Inicializar y manejar el ciclo de interacciones
            await userQuestionLoop(client, thread.id, panel, config);
        } catch (error: any) {
            panel.webview.html = getWebviewContent(`Error: ${error.message || 'Unknown error'}`);
        }
    });

    context.subscriptions.push(command);
}


async function getApiKey(): Promise<string | undefined> {
    while (true) {
        const apiKey = await vscode.window.showInputBox({ prompt: 'Enter your OpenAI API Key', ignoreFocusOut: true });
        if (apiKey !== undefined) {
            return apiKey;
        }
        // Mostrar mensaje para reintentar si el usuario cancela
        const retry = await vscode.window.showInformationMessage('You cancelled the input. Do you want to retry?', 'Yes', 'No');
        if (retry !== 'Yes') {
            return undefined;
        }
    }
}

async function getAssistantId(): Promise<string | undefined> {
    while (true) {
        const asstId = await vscode.window.showInputBox({ prompt: 'Enter your Assistant ID', ignoreFocusOut: true });
        if (asstId !== undefined) {
            return asstId;
        }
        const retry = await vscode.window.showInformationMessage('You cancelled the input. Do you want to retry?', 'Yes', 'No');
        if (retry !== 'Yes') {
            return undefined;
        }
    }
}


async function userQuestionLoop(client: any, threadId: string, panel: vscode.WebviewPanel, config: any) {

    const run = await client.beta.threads.runs.createAndPoll(threadId, {
        assistant_id: config.assistantId
    });

    const messages = await client.beta.threads.messages.list(threadId);
    const responseMessage = findResponseMessage(messages.data, run);

    if (responseMessage) {
        // Descompone la respuesta en caso de que sea un objeto
        const responseObjects = responseMessage.content;
        const formattedValues = formatResponseArray(responseObjects);

        panel.webview.html += `<div class="assistant-message"><strong>Assistant:</strong><pre><code>${formattedValues}</code></pre></div>`;
    } else {
        panel.webview.html += "<p>Error: No response from assistant.</p>";
    }

    panel.webview.html += "<br>";  // Añadir un salto de línea para separación visual

    // Continuar el loop de preguntas
    // await userQuestionLoop(client, threadId, panel);
}

function findResponseMessage(messages: any, run: any) {
    let responseMessage = null;

    for (const message of messages) {
        if (message.role === "assistant" && message.created_at > run.created_at) {
            responseMessage = message;
            break;
        }
    }

    return responseMessage;
}

function formatResponseArray(responseArray: any[]): string {
    return responseArray.map(responseObject => {
        if (responseObject && responseObject.text && 'value' in responseObject.text) {
            return escapeHtml(responseObject.text.value);
        }
        return '';  // En caso de formato inesperado
    }).join('\n');
}

// Función para escapar caracteres HTML
function escapeHtml(unsafe: string) {
    return unsafe.replace(/[&<"']/g, function (m) {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return m;
        }
    });
}

function getWebviewContent(message: string) {
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; margin: 10px; }
                    .user-message, .assistant-message { padding: 10px; margin: 5px 0; border-radius: 4px; }
                    .user-message { background-color: #e0f7fa; }
                    .assistant-message { background-color: #f1f8e9; }
                    strong { font-weight: bold; }
                </style>
            </head>
            <body>
                ${message}
            </body>
            </html>`;
}

// Esta función es para limpiar los recursos cuando se desactiva la extensión
export function deactivate() { }
