var redis = require("redis");
var app = require("express")();
var SocketIO = require("socket.io");
var config = require("../config.json");

console.log("Loading...");

var http = null;
if (config.socketIO.https) {
	var credentials = {
		key: fs.readFileSync(config.socketIO.privatekeyPath),
		cert: fs.readFileSync(config.socketIO.certificatePath)
	};
	http = require('https').Server(credentials, app);
}
else {
	http = require("http").Server(app);
}


var redisClient = null;
app.listen(config.socketIO.port);
var io = new SocketIO({serveClient: false});
io.origins(config.socketIO.origins);
io.attach(http);

connectRedis().then(function(a) {
	redisClient = a;

	redisClient.on("message", function(channel, message) {
		if (channel !== "siteNotificationsChannel") {
			return;
		}
		var data = JSON.parse(message);
		emitEvent(data.eventId, data.payload);
	});

	redisClient.subscribe("siteNotificationsChannel");
	console.log("Loaded.");
});

function connectRedis() {
	var client = redis.createClient(config.redis.port, config.redis.host);
	return new Promise(function(resolve) {
		client.auth(config.redis.password, function() {
			resolve(client);
		});
	});
}

function emitEvent(eventId, payload) {
	var completeEvent = {
		id: eventId,
		payload: payload,
		time: Date.now()
	};
	return new Promise(function(resolve) {
		console.log('Emitting event with id "'+eventId+'" on socket.');
		io.emit(eventId, payload);
		console.log('Emitted event with id "'+eventId+'" on socket.');
		resolve();
	});
}