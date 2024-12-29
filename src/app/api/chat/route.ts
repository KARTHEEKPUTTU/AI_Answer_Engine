// TODO: Implement the chat API with Groq and web scraping with Cheerio and Puppeteer
// Refer to the Next.js Docs on how to read the Request body: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
// Refer to the Groq SDK here on how to use an LLM: https://www.npmjs.com/package/groq-sdk
// Refer to the Cheerio docs here on how to parse HTML: https://cheerio.js.org/docs/basics/loading
// Refer to Puppeteer docs here: https://pptr.dev/guides/what-is-puppeteer

import { groq_response } from "@/app/Utils/groq_client";
import { NextResponse } from "next/server";
import { scrape_url, urlPattern } from "@/app/Utils/scraper";

export async function POST(req: Request) {
  try {
    const {message,messages} = await req.json()
    console.log("message recieved:",message);
    console.log("messages:",messages);

    const urlMatch = message.match(urlPattern);
    const url = urlMatch ? urlMatch[0] : null;

    let scraped_content = "";

    if(url){
      console.log("url Found:",url);
      const scrapper_response = await scrape_url(url);
      console.log("Scraped_Content : ",scraped_content);
      if(scrapper_response){
        scraped_content = scrapper_response.content;
      }
    }
    //Extracting the user's query by removing the url from message
    const UserQuery = message.replace(url ? url[0] : '','').trim();

    const userPrompt = `
    Answer my question : "${UserQuery}"

    Based on the following content : <content> ${scraped_content} </content>
    
    `

    const llmMessages =[
      // ...(Array.isArray(messages) ? messages : []),
      ...messages,
      {
        role: "user",
        content : userPrompt,
      },
    ];
    console.log(llmMessages);

    const aiMessage = await groq_response(llmMessages);
    return NextResponse.json ({message : aiMessage})
 
  } catch (error) {

    return NextResponse.json ({message : "Error"})

  }
}
