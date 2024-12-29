import Groq from "groq-sdk";

const client = new Groq({
  apiKey: process.env["GROQ_API_KEY"],
});

interface ChatMessage {
  role: "user" | "system" | "assistant";
  content: string;
}
export async function groq_response(ChatMessages: ChatMessage[]) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "you are an academic expert, you always cite your sources and base your responses on the context that you have been provided",
    },
    ...ChatMessages,
  ];
  console.log("messages:", messages);
  console.log("starting groq API request:");
  const response = await client.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages,
  });
  console.log("Recieved groq API request:", response);
  return response.choices[0].message.content;
}
