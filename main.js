const fs = require("fs");
const axios = require("axios");
const login = require("fca-unofficial");
const {
	spawn
} = require('child_process');
const express = require('express');
const { Readable } = require('stream');

const app = express();

const server = app.listen(9000, () => {});
app.get('/', (req, res) => {
	res.send('Bot is up and running.');
});

var msgs = [];
var timestamps = [];
var admins = [];
var vips = [];
var vipCmds = [];
const prefix = '/';
var status = true;
var onProcess = 0;
var threaderProcess = false;

function readFile(file) {
	try {
		const data = fs.readFileSync(file, 'utf8');
		return data.trim().split('\n');
	} catch (err) {
		console.error(err);
		return null;
	}
}

async function download(url, filePathToSave) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePathToSave);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }
}

function toggle(filename, searchString) {
	return new Promise((resolve, reject) => {
		fs.readFile(filename, 'utf8', (err, data) => {
			if (err) {
				console.error(err);
				reject(err);
				return;
			}

			const lines = data.split('\n');
			const index = lines.findIndex(line => line.trim() === searchString);

			if (index !== -1) {
				lines.splice(index, 1);
				const updatedData = lines.join('\n');
				fs.writeFile(filename, updatedData, 'utf8', err => {
					if (err) {
						console.error(err);
						reject(err);
						return;
					}
					console.log(`String '${searchString}' removed from ${filename}.`);
					resolve(false);
				});
			} else {
				lines.push(searchString);
				const updatedData = lines.join('\n');
				fs.writeFile(filename, updatedData, 'utf8', err => {
					if (err) {
						console.error(err);
						reject(err);
						return;
					}
					console.log(`String '${searchString}' added to ${filename}.`);
					resolve(true);
				});
			}
		});
	});
}

function waitProcess() {
	return new Promise(resolve => {
		const interval = setInterval(() => {
			if (onProcess < 2) {
				clearInterval(interval);
				resolve();
			}
		}, 100);
	});
}

function waitThreaderProcess() {
	return new Promise(resolve => {
		const interval = setInterval(() => {
			if (threaderProcess == false) {
				clearInterval(interval);
				resolve();
			}
		}, 100);
	});
}

admins = readFile('./permissions/admins.txt');
vips = readFile('./permissions/vips.txt');
vipCmds = readFile('./permissions/vipCmds.txt');
bans = readFile('./permissions/bans.txt');

login({
	appState: JSON.parse(fs.readFileSync('customizable/appstate.json', 'utf8'))
}, async (err, api) => {
	if (err) return console.error(err);

	api.setOptions({
		listenEvents: true,
		selfListen: true,
		autoMarkDelivery: false,
		online: true
	});

	const myID = await api.getCurrentUserID();

	fs.readFile('logs/lastmg.txt', 'utf8', (err, msgid) => {
		if (err) {
			return;
			console.error(err)
		}
		if (msgid != '') {
			api.setMessageReaction('🟢', msgid, (err) => {
				if (err) {
					return;
				}
			}, true)
		}
	});

	async function run(filePath, event) {
		if (fs.existsSync(filePath)) {
			await waitProcess();
			onProcess += 1;
			let errc = 0;

			const childProcess = spawn('node', [filePath, JSON.stringify(event)], {
				stdio: ['inherit', 'pipe', 'pipe']
			});

			childProcess.stdout.on('data', (data) => {
				var output = data.toString().trim();

				try {
					output = JSON.parse(output);

					if (fs.statSync(output.attachment).isDirectory()) {
						const files = fs.readdirSync(output.attachment);

						const attachmentStreams = files.map(file => {
							const filePath = `${output.attachment}/${file}`;
							return fs.createReadStream(filePath);
						});

						api.sendMessage({
							body: output.body,
							attachment: attachmentStreams,
						}, event.threadID, event.messageID);

						fs.rmdirSync(output.attachment, {
							recursive: true
						});
					} else {
						api.sendMessage({
							body: output.body,
							attachment: fs.createReadStream(output.attachment),
						}, event.threadID, (err) => {
							if (err) {
								api.sendMessage('Please change the prompt or try again.', event.threadID, event.messageID);
							} else fs.unlinkSync(output.attachment);
						}, event.messageID)
					}
				} catch (e) {
					api.sendMessage(output, event.threadID, event.messageID);
				}
			})


			childProcess.stderr.on('data', (data) => {
				const error = data.toString().trim();
				console.log(error);
				errc++;
			});

			childProcess.on('close', (code) => {
				if (errc > 0) {console.log("Something went wrong, please try again later.")}
				onProcess -= 1;
			});
		}
	}

	async function threader(threadID) {
		await waitThreaderProcess()
		threaderProcess = true;
		const threadInfo = await api.getThreadInfo(threadID);

		setTimeout(() => {
			threaderProcess = false;
		}, 15000)

		return threadInfo;
	}


	var listenEmitter = api.listen(async (err, event) => {
		if (err) return console.error(err);

		if (event.type == 'event') {
			switch (event.logMessageType) {
				case 'log:unsubscribe':
					const threads = readFile('permissions/antiout.txt');

					if (threads.includes(event.threadID)) {
						api.addUserToGroup(event.author, event.threadID);
					}
					break;

				case 'log:subscribe':
					if (event.logMessageData.addedParticipants[0].userFbId == myID) {
						api.changeNickname('NilmarBOT🤖', event.threadID, myID);
					}
					break;

				case 'log:user-nickname':
					console.log(event);
					break;
			}
		}

		if (event.type == 'message_unsend') {
			const threads = readFile('permissions/antiunsend.txt');

			if (!threads.includes(event.threadID)) return;

      var extension = '';
			const deletedEvents = msgs.filter(message => message.messageID == event.messageID);
      const deletedEvent = deletedEvents[0];

      const userinfo = await api.getUserInfo(event.senderID);
      const senderName = userinfo[event.senderID].name;

			if (deletedEvent.attachments && deletedEvent.attachments.length > 0) {
				switch (deletedEvent.attachments[0].type) {
					case 'sticker': 
            api.sendMessage({
							body: senderName + " unsent this sticker:"
						}, event.threadID);
						api.sendMessage({
							sticker: deletedEvent.attachments[0].ID
						}, event.threadID);
						break;

					case 'video':
					case 'animated_image':
					case 'audio':
					case 'photo':
            
            if (deletedEvent.attachments[0].type == 'photo') extension = 'png';
            else if (deletedEvent.attachments[0].type == 'animated_image') extension = 'gif';
            else if (deletedEvent.attachments[0].type == 'audio') extension = 'mp3';
            else if (deletedEvent.attachments[0].type == 'video') extension = 'mp4';

            await download(deletedEvent.attachments[0].url, `./cache/${event.senderID}un.${extension}`);
            
						api.sendMessage({
              body: senderName + " unsent this " + deletedEvent.attachments[0].type + ":",
							attachment: fs.createReadStream(`./cache/${event.senderID}un.${extension}`)
						}, event.threadID);

            fs.unlinkSync(`./cache/${event.senderID}un.${extension}`);
						break;
				}
			}
      else if (deletedEvent.body) {
        api.sendMessage(`${senderName} unsent this message:\n\n${deletedEvent.body}`, event.threadID);
      }
		}

			if (event.type == 'message' || event.type == 'message_reply') {

				const threads = readFile('permissions/antispam.txt');
				msgs.push(event);


				if (threads.includes(event.threadID)) {
					if (timestamps[event.senderID]) {
						if (event.timestamp - timestamps[event.senderID] <= 800) {
							api.removeUserFromGroup(event.senderID, event.threadID);
						}
					}
				}

				timestamps[event.senderID] = event.timestamp;

				//ADMIN COMMANDS
				if (!event.body) return;

				let command = event.body.split(" ")[0];
					command = command.substring(1);

				if (admins.includes(event.senderID)) {
					if (!status && event.body.startsWith(prefix + 'on')) {
						status = true;
						api.setMessageReaction('🟢', event.messageID, (err) => {
							if (err) {
								console.log(err)
								return;
							}
						}, true);
						return;
					} else if (status && event.body.startsWith(prefix + 'off')) {
						status = false;
						api.setMessageReaction('🔴', event.messageID, (err) => {
							if (err) {
								console.log(err)
								return;
							}
						}, true);
						return;
					} else if (status && event.body.startsWith(prefix + 'ban')) {
            if (event.mentions) {
							const id = Object.keys(event.mentions)[0];
							const name = Object.values(event.mentions)[0];

							toggle('permissions/bans.txt', id)
								.then(result => {
									if (result == true) {
										api.sendMessage(`${name} is now banned from using the bot.`, event.threadID, event.messageID);
										bans.push(id.toString());
									} else {
										api.sendMessage(`${name} has been removed from the blacklist of the bot.`, event.threadID, event.messageID);
										bans = bans.filter(element => element !== id.toString());
									}
								})
								.catch(error => console.error(error));
						}
          } else if (status && event.body.startsWith(prefix + 'restart')) {
						fs.writeFile('logs/lastmg.txt', event.messageID, (err) => {
							if (err) {
								console.error('Error writing to file:', err);
								return;
							} else {
								api.setMessageReaction('🔄', event.messageID, (err) => {
									if (err) {
										return;
									} else {
										const pid = process.pid;
										process.kill(pid);
									}
								}, true);
							}
						});
					} else if (status && event.body.startsWith(prefix + 'admin')) {
						if (event.mentions) {
							const id = Object.keys(event.mentions)[0];
							const name = Object.values(event.mentions)[0];

							toggle('permissions/admins.txt', id)
								.then(result => {
									if (result == true) {
										api.sendMessage(`${name} is now an admin.`, event.threadID, event.messageID);
										admins.push(id.toString());
									} else {
										api.sendMessage(`${name} has been removed as an admin.`, event.threadID, event.messageID);
										admins = admins.filter(element => element !== id.toString());
									}
								})
								.catch(error => console.error(error));
						}
					} else if (status && event.body.startsWith(prefix + 'vip')) {
						if (event.mentions) {
							const id = Object.keys(event.mentions)[0];
							const name = Object.values(event.mentions)[0];

							toggle('permissions/vips.txt', id)
								.then(result => {
									if (result == true) {
										api.sendMessage(`${name} is now a VIP.`, event.threadID, event.messageID);
										vips.push(id.toString());
									} else {
										api.sendMessage(`${name} has been removed as a VIP.`, event.threadID, event.messageID);
										vips = vips.filter(element => element !== id.toString());
									}
								})
								.catch(error => console.error(error));
						}
					} else if (event.messageReply && status && event.body.startsWith(prefix + 'unsend')) {
						api.unsendMessage(event.messageReply.messageID, (err) => {
							if (err) {
								api.sendMessage('Error: Unable to unsend message. Check the console for debugging.', event.threadID, event.messageID);
								console.error(err);
							}
						});
					}
				}
				//END OFF ADMIN COMMANDS

				if (bans.includes(event.senderID) || !status) return;

				if (event.messageReply && event.messageReply.body) {
					const origin = event.messageReply.body.split(" ")[0].toLowerCase();
					if (!status) return;
					run(`./events/${origin}.js`, event);
				}

				if (event.body.startsWith(prefix)) {

					//GC ADMINS COMMAND
					switch (command) {
						case 'antispam':
						case 'autowelcome':
						case 'antiunsend':
						case 'antiout':
							const threadInfo = await threader(event.threadID);
							const adminIDs = threadInfo.adminIDs.map(item => item.id);
							const senderID = event.senderID;
							const isAdmin = adminIDs.includes(senderID);

							if (isAdmin) {
								toggle(`./permissions/${command}.txt`, event.threadID).then(result => {
									const action = result ? 'on' : 'off';
									api.sendMessage(`${command.toUpperCase()} is now ${action} for your GC.`, event.threadID, event.messageID);
								});
							} else {
								api.sendMessage(`This command is only allowed for this Groupchat's admins.`, event.threadID, event.messageID);
							}
							break;
					}

					run(`./modules/${command}.js`, event);
				}

			}

	});
});
