import Slack, {} from "@slack/bolt";
import { StringIndexed } from "@slack/bolt/dist/types/helpers.js";
const { App, subtype } = Slack;

import { config } from "dotenv";
config();

const { SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_APP_TOKEN,SLACK_CLIENT_SECRET } = process.env;

const VIC_UPTIME = "C07Q7D0NDTJ";
const URBAN_DICTIONARY_BASE_URL = 'https://api.urbandictionary.com/v0';

const slack = new App({
	token: SLACK_BOT_TOKEN,
	appToken: SLACK_APP_TOKEN,
	socketMode: true, //TODO dont use socket mode
	signingSecret: SLACK_SIGNING_SECRET,
	port: 6777,
	clientSecret: SLACK_CLIENT_SECRET,
});

async function define(term:string): Promise<Definition[]>{
	console.log({term})
	let t = encodeURI(term)

	let requrl = URBAN_DICTIONARY_BASE_URL+`/define?term=${t}`
	let res = await fetch(requrl)
	let data: UDResponse = await res.json()
	const definitions = data.list.map(def => ({
		...def,
		written_on: new Date(def.written_on),
	}));
	return definitions;
}




slack.command("/urbandictionary", async ({ ack, body, client,respond, command }) => {
	await ack();
	let term = body.text;
	if (!term) {
		await respond({text:"You need to provide a term to search in the Urban Dictionary.",mrkdwn:true,response_type:'ephemeral'})
		return;
	}
	if (term.length > 25){
		await respond({text:"Please use a term shorter than 25 characters",mrkdwn:true,response_type:'ephemeral'})
		return;
	}

	const has_access = await isBotInChannel(client,body.channel_id)


if (!has_access) {

	try {
		const definitions: Definition[] = await define(term)
		let blocks = generateDefinitonBlocks(definitions[0],0,false)
		respond({blocks,response_type:'in_channel'})
	} catch{
		await respond({text:"Definition not found. :(",mrkdwn:true,response_type:'ephemeral'})
		return
	}

} else {

	try {
		const definitions: Definition[] = await define(term)
		let blocks = generateDefinitonBlocks(definitions[0],0,true)
		await respond({text:'sure',response_type:'ephemeral'})
		await client.chat.postMessage({blocks,channel:body.channel_id})
	} catch{
		await respond({text:"Definition not found. :(",mrkdwn:true,response_type:'ephemeral'})
		return
	}
}

	

});
slack.action('unaviable',async({ack,action,body,respond,client})=>{
	await ack();
	await respond({text:'Unfourtunately slack API is trash so for pagination support, you need to add the bot to your channel.'})
})
slack.action('next', async({ack,action,body,respond,client})=>{
	if(body.type !== "block_actions")return
	if(action.type !== 'button')return
	ack()

	console.log(body.message)
	const message = body.message?.ts || ''
	const channel = body.channel?.id || ''
	const value = action.value?.split('-') ?? ['','']

	console.log({message,channel,value})
	const term = atob(value[0])
	const iter = Number(value[1])+1

	try {
		const definitions= await define(term)
		const blocks = generateDefinitonBlocks(definitions[iter],iter,true)

		client.chat.update({ts:message, channel,blocks})
	} catch	{
		await respond({text:"Error trying to go to the next definition. :(",mrkdwn:true,response_type:'ephemeral'})
		return
	}
})


function generateDefinitonBlocks(definition: Definition,i:number,buttons:boolean):Slack.KnownBlock[]  {
	const blocks = [
			{
				"type": "header",
				"text": {
					"type": "plain_text",
					"text": definition.word,
					"emoji": true
				}
			},
			{
				"type": "section",
				"text": {
					"type": "mrkdwn",
					"text": `*Definition #${i+1}*`
				}
			},
			{
				"type": "divider"
			},
			{
				"type": "section",
				"text": {
					"type": "mrkdwn",
					"text": definition.definition
				}
			},
			{
				"type": "divider"
			},
			{
				"type": "actions",
				"elements": [
					{
						"type": "button",
						"text": {
							"type": "plain_text",
							"text": "Previous",
							"emoji": true
						},
						"value": "previous",
				"action_id":"next"

					},
					{
						"type": "button",
						"text": {
							"type": "plain_text",
							"text": "Next",
							"emoji": true
						},
						"value": "next",
				"action_id":"next"

					}
				]
			},
			{
				"type": "context",
				"elements": [
					{
						"type": "mrkdwn",
						"text": `${definition.thumbs_up} 👍 —— <!date^${Math.round(definition.written_on.getTime()/1000)}^{date}|${definition.written_on.toISOString()}>`
					},
					{
						"type": "mrkdwn",
						"text": `Definition <${definition.permalink}|${definition.defid}> by ${definition.author} from <https://www.urbandictionary.com/|urban dictionary>. .`
					}
				]
			}
		]
	
		if (!buttons){
			blocks[5].elements = [
				{
					"type": "button",
					"text": {
						"type": "plain_text",
						"text": "pagination",
						"emoji": true
					},
					"value": `${btoa(definition.word)}-${i}`,
					"action_id":"unaviable"
				}]
			
				return blocks as Slack.KnownBlock[]
		}

		if (i != 0 ){
			blocks[5].elements = [{
				"type": "button",
				"text": {
					"type": "plain_text",
					"text": "Previous",
					"emoji": true
				},
				"value": `${btoa(definition.word)}-${i}`,
				"action_id":`previous`

			},
			{
				"type": "button",
				"text": {
					"type": "plain_text",
					"text": "Next",
					"emoji": true
				},
				"value": `${btoa(definition.word)}-${i}`,
				"action_id":"next"

			}]
		} else {
			blocks[5].elements = [
			{
				"type": "button",
				"text": {
					"type": "plain_text",
					"text": "Next",
					"emoji": true
				},
				"value": `${btoa(definition.word)}-${i}`,
				"action_id":"next"
			}]
		}
		return blocks as Slack.KnownBlock[];
	
}

async function isBotInChannel(client: Slack.App["client"], id: string): Promise<boolean> {
	try {
	  await client.conversations.info({ channel: id });
	  return true; // Bot has access to the channel
	} catch (error) {
	  return false; // Bot does not have access or an error occurred
	}
  }
  

await slack.start();

export interface Definition {
    definition:   string;
    permalink:    string;
    thumbs_up:    number;
    author:       string;
    word:         string;
    defid:        number;
    current_vote: string;
    written_on:   Date;
    example:      string;
    thumbs_down:  number;
}
export interface UDResponse {
	list: Definition[];
}