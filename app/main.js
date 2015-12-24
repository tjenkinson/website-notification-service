var fs = require("fs");
var redis = require("redis");
var app = require("express")();
var SocketIO = require("socket.io");
var config = require("../config.json");

console.log("Loading...");

var http = null;
if (config.socketIO.https) {
	var credentials = {
		key: fs.readFileSync(config.socketIO.privateKeyPath).toString(),
		cert: fs.readFileSync(config.socketIO.certificatePath).toString()
	};
	if (config.socketIO.intermediateCertificatePath) {
		credentials.ca = fs.readFileSync(config.socketIO.intermediateCertificatePath).toString();
	}
	http = require('https').Server(credentials, app);
}
else {
	http = require("http").Server(app);
}

var redisClient = null;
var io = null;

Promise.all([connectRedis(), connectSocketIO()]).then(function(results) {
	redisClient = results[0];
	io = results[1];

	io.on('connection', function(socket) {
		console.log('Got a connection.');
	});

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

function connectSocketIO() {
	return new Promise(function(resolve) {
		var io = new SocketIO(http, {serveClient: false});
		http.listen(config.socketIO.port, function() {
			resolve(io);
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