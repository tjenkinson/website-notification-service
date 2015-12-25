var fs = require("fs");
var redis = require("redis");
var mysql = require("mysql");
var app = require("express")();
var SocketIO = require("socket.io");
var SocketIOAuth = require('socketio-auth');
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
var mysqlCon = null;

Promise.all([connectRedis(), connectMysql(), connectSocketIO()]).then(function(results) {
	redisClient = results[0];
	mysqlCon = results[1];
	io = results[2];

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

function connectMysql() {
	return new Promise(function(resolve) {
		var connection = mysql.createConnection({
			host: config.mysql.host,
			port: config.mysql.port,
			user: config.mysql.user,
			password: config.mysql.password,
			database: config.mysql.database
		});
		connection.connect(function(err) {
			if (err) throw(err);
			resolve(connection);
		});
	});
}

function connectSocketIO() {
	return new Promise(function(resolve) {
		var io = new SocketIO(http, {serveClient: false});
		SocketIOAuth(io, {
 			authenticate: authenticateUser,
			timeout: 3000
		});

		http.listen(config.socketIO.port, function() {
			resolve(io);
		});
	});
}

function authenticateUser(socket, data, callback) {
	var denied = function() {
		console.log("User denied access.");
		callback(new Error("Access denied."));
	};

	isValidSessionId(data.sessionId).then(function(valid) {
		if (valid) {
			console.log("User granted access.");
			callback(null, true);
		}
		else {
			denied();
		}
	}).catch(function(e) {
		console.log(e);
		denied();
	});
}

function isValidSessionId(id) {
	return new Promise(function(resolve, reject) {
		if (typeof(id) !== "string") {
			reject("ID not a string.");
			return;
		}
		mysqlCon.query('SELECT count(*) as count FROM sessions WHERE id=?', [id], function(err, results) {
			if (err) throw(err);
			resolve(results[0].count > 0);
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