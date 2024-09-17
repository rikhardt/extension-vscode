import * as vscode from 'vscode';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Asegúrate de definir esto como una variable de entorno
});

const panel = vscode.window.createOutputChannel('BecheCode Assistant');

// Función para imprimir en la ventana de VSCode en lugar de stdout
function print(txt: string) {
    // Asegurar un salto de línea al final del texto
    panel.append(txt.replace("\\", ""));
    panel.show(true);
}

async function promptGPT(prompt: string) {
    const ASSISTANT_NAME = "BIG CODE - Nestjs";

    try {
        // Configurar el Asistente
        let assistant;
        const assistants = await openai.beta.assistants.list();
        assistant = assistants.data.find(assistant => assistant.name === ASSISTANT_NAME);

        if (!assistant) {
            assistant = await openai.beta.assistants.create({
                name: ASSISTANT_NAME,
                instructions: "You are a helpful assistant who is obsessed with Barbie movies.",
                model: "gpt-4-turbo-preview"
            });
        }

        // Crear un hilo
        const thread = await openai.beta.threads.create();

        // Crear mensaje en el hilo
        await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: prompt
        });

        // Ejecutar el hilo con el asistente
        const run = openai.beta.threads.runs
            .stream(thread.id, { assistant_id: assistant.id })
            .on('textDelta', (textDelta) => print(textDelta.value || ""));

        // Finalizar ejecución
        await run.finalRun();
        panel.append('\n');
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error al interactuar con OpenAI: ${error.message}`);
    }
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.unittest', async () => {
        const prompt = await vscode.window.showInputBox({ prompt: 'Introduce tu consulta para el asistente:' });
        if (prompt) {
            await promptGPT(prompt);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }