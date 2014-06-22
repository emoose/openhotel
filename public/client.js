window.onload=function()
{
	//game variables
	var username="anon";
	var leggfx = 0;
	var id = "";
	var sessionID = -1;
	var gameSizeX = 1024;
	var gameSizeY = 1024;
	var x = 0;
	var y = 0;
	var newX = 0;
	var newY = 0;
	var mouseX = 0;
	var mouseY = 0;
	var speedPlayer = 1.25;
	var speedMonster = 0.75;
	var players = [];
	var bullets = [];
	var blockSize=10;
	var socket = io.connect();
	var canvas = document.getElementById("canvas");
	var ctx = $("#canvas")[0].getContext("2d");
	var canvas2 = document.getElementById("canvas2");
	var showDisconnected = false;
	var disableZombies = false;
	var swapMouse = false;
	var disableBackground = true;
	var img = new Image();
	var currentRoom = 'public';
	var roundEndTime = 0;
	var roundTimer = 0;
	var dontLog = false;
	var currentTime = getHighResTime();
	var humanimg=document.getElementById("humanimg");
	var monsterimg=document.getElementById("monsterimg");
	var playerimg=document.getElementById("playerimg");
	//Tracking player state
	// Keep track of player actions
	var playerShooting = false;
	var playerMoving = false;
	var keyW = false;
	var keyA = false;
	var keyS = false;
	var keyD = false;
	// Keep track of bullet/movement cooldown (stop players from firing a ton of bullets in a small period)
	var BULLET_FIRE_RATE = 15; // Constant, cooldownTimer resets to this when bullet is fired
	var MOVEMENT_RATE = 10;
	var bulletCooldown = 0;
	var movementCooldown = 0;
	var hidden, visibilityChange;
	//Utility functions
	if (typeof document.hidden !== "undefined")
	{ // Opera 12.10 and Firefox 18 and later support
		hidden = "hidden";
		visibilityChange = "visibilitychange";
	}
	else if (typeof document.mozHidden !== "undefined")
	{
		hidden = "mozHidden";
		visibilityChange = "mozvisibilitychange";
	}
	else if (typeof document.msHidden !== "undefined")
	{
		hidden = "msHidden";
		visibilityChange = "msvisibilitychange";
	}
	else if (typeof document.webkitHidden !== "undefined")
	{
		hidden = "webkitHidden";
		visibilityChange = "webkitvisibilitychange";
	}
	function loadImage()
	{
		if(disableBackground)
		{
			return;
		}
		var result = ScaleImage(img.width, img.height, gameSizeX, gameSizeY, true);
		var dimensions = {width: img.width, height: img.height};
		if(dimensions.width > gameSizeX || dimensions.height > gameSizeY)
		{
			dimensions = result;
		}
		else if(gameSizeX > dimensions.width || gameSizeY > dimensions.height)
		{
			dimensions = {width: gameSizeX, height: gameSizeY};
		}
		$("#bgimage").attr('src', img.src);
		$("#bgimage").css("height",dimensions.height + "px");
		$("#bgimage").height = dimensions.height;
		$("#bgimage").css("width",dimensions.width + "px");
		$("#bgimage").width = dimensions.width;
	}
	img.onload = loadImage;
	/* thanks to http://selbie.wordpress.com/2011/01/23/scale-crop-and-center-an-image-with-correct-aspect-ratio-in-html-and-javascript/ */
	function ScaleImage(srcwidth, srcheight, targetwidth, targetheight, fLetterBox)
	{
		var result = { width: 0, height: 0, fScaleToTargetWidth: true };
		if ((srcwidth <= 0) || (srcheight <= 0) || (targetwidth <= 0) || (targetheight <= 0))
		{
			return result;
		}
		// scale to the target width
		var scaleX1 = targetwidth;
		var scaleY1 = (srcheight * targetwidth) / srcwidth;
		// scale to the target height
		var scaleX2 = (srcwidth * targetheight) / srcheight;
		var scaleY2 = targetheight;
		// now figure out which one we should use
		var fScaleOnWidth = (scaleX2 > targetwidth);
		if (fScaleOnWidth)
		{
			fScaleOnWidth = fLetterBox;
		}
		else
		{
			fScaleOnWidth = !fLetterBox;
		}
		if (fScaleOnWidth)
		{
			result.width = Math.floor(scaleX1);
			result.height = Math.floor(scaleY1);
			result.fScaleToTargetWidth = true;
		}
		else
		{
			result.width = Math.floor(scaleX2);
			result.height = Math.floor(scaleY2);
			result.fScaleToTargetWidth = false;
		}
		result.targetleft = Math.floor((targetwidth - result.width) / 2);
		result.targettop = Math.floor((targetheight - result.height) / 2);
		return result;
	}
	function handleVisibilityChange()
	{
		if (!document[hidden])
		{
			refreshGame();
		}
		else
		{
			console.log('hidden...');
		}
	}
	function makeTextSafe(text)
	{
		var div = document.createElement('div');
		div.appendChild(document.createTextNode(text));
		return div.innerHTML;
	}
	function addToLog(entry)
	{
		if(dontLog)
		{
			return;
		}
		var log = $("#event_log").html();
		log = entry + "<br />" + log;
		$("#event_log").html(log);
	}
	function getHighResTime()
	{
		return (+new Date());
	}
	function getTime()
	{
		return Math.round(+new Date()/1000);
	}
	//Game functions
	function draw()
	{
		$("#inputMessage").show();
		$("#usernameInputs").hide();
		if(playerShooting)
		{
			fireBullet();
		}
		if(playerMoving)
		{
			movePlayer();
		}
		var newtime = getHighResTime();
		var frametime = newtime - currentTime;
		currentTime = newtime;
		if(gameSizeX <= 0 || gameSizeY <= 0)
		{
			return;
		}
		ctx.clearRect(0,0,gameSizeX,gameSizeY);//drawCells(cells);
		for(p=0;p<players.length;p++)
		{
			var player = players[p];
			if(window.location.pathname !== '/all' && !player.connected && !showDisconnected) // don't draw disconnected players
			{
				continue;
			}
			if(player.connected)
			{
				var speed = (0.5 * speedPlayer) * (frametime / 10);
				if(player.x<player.newX || (player.moveRight && !player.bulletHit))
				{
					player.x+=speed;
					if(player.moveRight && !player.bulletHit)
					{
						player.newX = player.x; player.newY = player.y;
					}
					if(player.x > player.newX) player.x = player.newX;
				}
				if(player.x>player.newX || (player.moveLeft && !player.bulletHit))
				{
					player.x-=speed;
					if(player.moveLeft && !player.bulletHit)
					{
						player.newX = player.x; player.newY = player.y;
					}
					if(player.x < player.newX) player.x = player.newX;
				}
				if(player.y<player.newY || (player.moveDown && !player.bulletHit))
				{
					player.y+=speed;
					if(player.moveDown && !player.bulletHit)
					{
						player.newX = player.x; player.newY = player.y;
					}
					if(player.y > player.newY) player.y = player.newY;
				}
				if(player.y>player.newY || (player.moveUp && !player.bulletHit))
				{
					player.y-=speed;
					if(player.moveUp && !player.bulletHit)
					{
						player.newX = player.x; player.newY = player.y;
					}
					if(player.y < player.newY) player.y = player.newY;
				}
				if(player.x < 0)
				{
					player.x = 0;
				}
				if(player.y < 0)
				{
					player.y = 0;
				}
				if(player.x >= (gameSizeX - 10))
				{
					player.x = gameSizeX - 10;
				}
				if(player.y >= (gameSizeY - 10))
				{
					player.y = gameSizeY - 10;
				}
			}
			if(player.id == id) // change border to red if its us
				{
					if (player.monster)
					{
						if(leggfx==1)
						{
							ctx.fillStyle = "#8B0000";
							ctx.fillRect(player.x + 1,player.y + 1,8,8);
						}
						else
						{
							ctx.drawImage(playermonsterimg,player.x-4,player.y-4,18,14);
						}
					}
					else
					{
						if(leggfx==1)
						{
							ctx.fillStyle = "#000";
							ctx.fillRect(player.x + 1,player.y + 1,8,8);
						}
						else
						{
							ctx.drawImage(playerimg,player.x-4,player.y-4,18,14);
						}
					}
				}
			else
				{
					if(leggfx==1)
					{
						ctx.fillStyle = "#A9A9A9";
						ctx.fillRect(player.x + 1,player.y + 1,8,8);
					}
					else
					{
						ctx.drawImage(humanimg,player.x-4,player.y-4,18,14);
					}
				}
			if(player.monster && player.id != id)
			{
				if(leggfx==1)
				{
					ctx.fillStyle = "#FF8C00";
					ctx.fillRect(player.x + 1,player.y + 1,8,8);
				}
				else
				{
					ctx.drawImage(monsterimg,player.x-4,player.y-4,18,14);
				}
			}
		}
		// draw bullets above players
		if(!disableZombies)
			for(i = 0; i < bullets.length; i++)
			{
				bullets[i].x += bullets[i].velocity[0] * (frametime / 10);
				bullets[i].y += bullets[i].velocity[1] * (frametime / 10);
				ctx.beginPath();
				if(leggfx==1)
				{
					ctx.fillStyle = "#FF8C00";
					ctx.fillRect(bullets[i].x-3, bullets[i].y-3, 6, 6);
				}
				else
				{
					ctx.drawImage(bulletimg,bullets[i].x, bullets[i].y-12,8,8);
				}
				ctx.closePath();
			}
		ctx.beginPath();
		ctx.moveTo(mouseX,mouseY);
		ctx.lineTo(mouseX+blockSize,mouseY);
		ctx.moveTo(mouseX+blockSize,mouseY);
		ctx.lineTo(mouseX+blockSize,mouseY+blockSize);
		ctx.moveTo(mouseX+blockSize,mouseY+blockSize);
		ctx.lineTo(mouseX,mouseY+blockSize);
		ctx.moveTo(mouseX,mouseY+blockSize);
		ctx.lineTo(mouseX,mouseY);
		ctx.stroke();
		ctx.closePath();
		drawCells(cells);
	}
	function fireBullet()
	{
		if(bulletCooldown <= 0)
		{
			socket.emit("fireBullet",
			{
				id: id, x: mouseX, y: mouseY, session: sessionID
			});
			bulletCooldown = BULLET_FIRE_RATE;
		}
		else
		{
			bulletCooldown--;
		}
	}
	function movePlayer()
	{
		if(movementCooldown <= 0)
		{
			socket.emit("position",
			{
				id: id, x: mouseX, y: mouseY, session: sessionID
			});
			movementCooldown = MOVEMENT_RATE;
		}
		else
		{
			movementCooldown--;
		}
	}
	function setTheme(themeName)
	{
		var bgcolor = "#fff";
		var fontcolor = "#000";
		var logbgcolor = "#EBEBEB";
		if(themeName === "dark")
		{
			bgcolor = "#282A2E";
			fontcolor = "#fff";
			logbgcolor = "#282A2E";
			$("#theme_toggle").prop('checked', true);
		}
		$("body").css("background-color", bgcolor);
		$("body").css("color", fontcolor);
		$("panes").css("background-color", bgcolor);
		$("panes").css("color", fontcolor);
		$("event_log").css("background-color", bgcolor);
		$("event_log").css("color", fontcolor);
		if(localStorage !== undefined && localStorage.theme !== themeName)
		{
			localStorage.theme = themeName;
		}
	}
	function refreshGame()
	{
		joinRoom(currentRoom);
		console.log('brought back!');
	}
	function updateUsername()
	{
		var username = $("#username_changer").val();
		$("#username_changer").val('');
		socket.emit("username",
		{
			id: id, username: name, session: sessionID
		});
		if(localStorage !== undefined)
		{
			localStorage.username = name;
		}
		// Tell the server your username
		socket.emit('add user', username);
	}
	function updateBackground()
	{
		var url = $("#bg_changer").val();
		if(url.length < 5 || (url.substring(0, 5) !== "http:" && url.substring(0, 5) !== "data:"))
		{
			return;
		}
		$("#bg_changer").val('');
		if(url.indexOf("4chan.org") > -1 || url.indexOf("4cdn.org") > -1)
		{
			alert("4chan images won't load for other people because of some hotlink protection bs, thanks moot");
			return;
		}
		socket.emit("updateImage",
		{
			id: id, src: url, session: sessionID
		});
	}
	function getPlayerName(playerid)
	{
		for(p=0;p<players.length;p++)
		{
			if(players[p].id!==playerid)
			{
				continue;
			}
			if(players[p].username !== undefined && players[p].username !== '')
			{
				return '<b>' + makeTextSafe(players[p].username) + '</b>';
			}
			return '<b>Player ' + playerid + '</b>';
		}
		return '<b>Unknown player</b>';
	}
	function joinRoom(room)
	{
		currentRoom = room;
		players = [];
		dontLog = true;
		socket.emit("joinRoom",
		{
			room: public
		});
	}
	function updateRoundTimer()
	{
		var timeLeft = roundEndTime - getTime();
		if(timeLeft <= 0)
		{
			clearInterval(roundTimer);
			timeLeft = 0;
		}
		var minutes = parseInt( timeLeft / 60 ) % 60;
		var seconds = timeLeft % 60;
		var result = (minutes < 10 ? "0" + minutes : minutes) + ":" + (seconds < 10 ? "0" + seconds : seconds);
		$("#round_timer").text(result);
	}
	//Server messages
	// sent when user joins a room
	socket.on("gameState", function(data)
	{
		console.log('received game state: ', data);
		id = data.id;
		if(sessionID === -1)
		{
			sessionID = data.session;
		}
		gameSizeX = data.x;
		gameSizeY = data.y;
		speedPlayer = data.speedPlayer;
		speedMonster = data.speedMonster;
		$("#canvas")[0].width = gameSizeX;
		$("#canvas")[0].height = gameSizeY;
		img.src = makeTextSafe(data.image);
		$("#bgimage_src").html('<a href="' + img.src + '">' + img.src + '</a>');
		$("#server_version").text(data.serverVersion);
		if(data.timeLeft > 0)
		{
			roundEndTime = getTime() + data.timeLeft;
			roundTimer = setInterval(updateRoundTimer, 1000);
		}
		console.log('connected, id ' + id + ' session ' + sessionID);
		if(localStorage !== undefined && localStorage.username !== undefined)
		{
			$("#username_changer").val(localStorage.username);
			updateUsername();
		}
	});
	// add new player to our list
	socket.on("newPlayer", function(data)
	{
		for(p=0;p<players.length;p++)
		{
			if(players[p].id!==data.id)
			{
				continue;
			}
			return;
		}
		//console.log('new player: ', data);
		players.push({id: data.id, username: data.username, x: data.x, y: data.y, newX: data.x, newY: data.y, monster: data.monster, connected: data.connected, moveRight: false, moveLeft: false, moveUp: false, moveDown: false});
		addToLog('<b>New player (ID ' + data.id + ') connected!</b>');
	});
	// add new bullet to bullet list
	socket.on("newBullet", function(data)
	{
		//console.log('new bullet: ', data);
		bullets.push({id: data.id, playerId: data.playerId, x: data.x, y: data.y, velocity: data.velocity, color: data.color, alive: data.alive});
	});
	// sent after user joins room and the player list has been sent
	socket.on("endPlayerList", function(data)
	{
		dontLog = false;
	});
	// update our player list with updated player info
	socket.on("updatePlayer", function(data)
	{
		//console.log('player update: ', data);
		for(p=0;p<players.length;p++)
		{
			if(players[p].id!==data.id)
			{
				continue;
			}
			var player = players[p];
			player.newX = data.x;
			player.newY = data.y;
			if(player.absolute !== undefined && player.absolute === 1)
			{
				player.x = data.x;
				player.y = data.y;
			}
			player.connected = data.connected;
			if(player.username !== data.username && data.username !== undefined && data.username !== '')
			{
				addToLog(getPlayerName(data.id) + ' changed name to "' + makeTextSafe(data.username) + '"');
			}
			player.username = data.username;
			player.moveRight = data.moveRight;
			player.moveLeft = data.moveLeft;
			player.moveUp = data.moveUp;
			player.moveDown = data.moveDown;
			player.bulletHit = data.bulletHit;
			if(player.monster !== data.monster && data.monster)
			{
				var attacker = " has become infected!";
				if(data.attackerid !== undefined && data.attackerid > 0)
				{
					attacker = " was bit by " + getPlayerName(data.attackerid) + "!";
				}
				addToLog(getPlayerName(data.id) + attacker);
			}
			player.monster = data.monster;
			break;
		}
	});
	// Remove bullet if it's dead, otherwise update its position
	socket.on("updateBullet", function(data)
	{
		// Search through bullet array to find bullet id that needs updating
		// Works, but is pretty inefficent, ideas?
		for(i = 0; i < bullets.length; i++)
		{
			if(bullets[i].id !== data.id)
			{
				continue;
			}
			var bullet = bullets[i];
			if(!data.alive)
			{
				bullets.splice(i, 1);
			}
			else
			{
				bullet.x = data.x;
				bullet.y = data.y;
			}
			break;
		}
	});
	// sent by the server when sessions don't match, usually means server was restarted
	socket.on("refresh", function(data)
	{
		// TODO: uncomment this once the game isn't updated as much
		//refreshGame();
		setTimeout(function()
		{
			window.location.reload(1);
		}, 1000);
	});
	// update background image
	socket.on("updateImage", function(data)
	{
		img.src = makeTextSafe(data.src);
		if(data.id !== undefined)
		{
			addToLog(getPlayerName(data.id) + ' changed the background to <a href="' + img.src + '">' + img.src + '</a>');
		}
		else
		{
			addToLog('Background changed to <a href="' + img.src + '">' + img.src + '</a>');
		}
		$("#bgimage_src").html('<a href="' + img.src + '">' + img.src + '</a>');
	});
	// new round started
	socket.on("roundStart", function(data)
	{
		roundEndTime = getTime() + data.timeLimit;
		roundTimer = setInterval(updateRoundTimer, 1000);
	});
	// round ended
	socket.on("roundEnd", function(data)
	{
		var text = "The humans managed to survive for five minutes!";
		if(data.id > 0)
		{
			text = "The last survivor was " + getPlayerName(data.victimid) + " until " + getPlayerName(data.id) + " bit them.";
		}
		addToLog("<b>Round ended!</b> " + text);
	});
	//Startup code, run when the page is loaded
	// setup ul.tabs to work as tabs for each div directly under div.panes
	$("ul.tabs").tabs("div.panes > div");
	// fix for canvas being unfocusable
	$("#canvas")[0].setAttribute('tabindex','0');
	$("#canvas")[0].focus();
	document.addEventListener(visibilityChange, handleVisibilityChange, false);
	$("#dc_toggle").click(function()
	{
		showDisconnected = $(this).is(":checked");
	});
	$("#zombie_toggle").click(function()
	{
		disableZombies = $(this).is(":checked");
	});
	$("#theme_toggle").click(function()
	{
		setTheme($(this).is(":checked") ? "dark" : "light");
	});
	$("#mouse_toggle").click(function()
	{
		swapMouse = $(this).is(":checked");
		var lsValue = swapMouse ? "1" : "0";
		if(localStorage !== undefined && localStorage.swapMouse !== lsValue)
			localStorage.swapMouse = lsValue;
	});
	$("#legacy_graphics").click(function()
	{
		legacygfx = $(this).is(":checked");
		if(leggfx==1)
		{
			leggfx = 0;
		}
		else
		{
			leggfx = 1;
		}
		var lsValue = swapMouse ? "1" : "0";
		if(localStorage !== undefined && localStorage.legacyGraphics !== leggfx)
			localStorage.legacyGraphics = leggfx;
	});
	$("#bg_toggle").click(function()
	{
		disableBackground = $(this).is(":checked");
		var lsValue = "0";
		if(disableBackground)
		{
			$("#bgimage").attr('src', "");
			$("#bgimage").css("height", "0px");
			$("#bgimage").height = 0;
			$("#bgimage").css("width", "0px");
			$("#bgimage").width = 0;
			lsValue = "1";
		}
		else
		{
			loadImage();
		}
		if(localStorage !== undefined && localStorage.disableBackground !== lsValue)
			localStorage.disableBackground = lsValue;
	});
	// load saved theme
	if(localStorage !== undefined && localStorage.theme !== undefined)
	{
		setTheme(localStorage.theme);
	}
	if(localStorage !== undefined && localStorage.swapMouse !== undefined && localStorage.swapMouse === "1")
	{
		swapMouse = true;
		$("#mouse_toggle").prop('checked', true);
	}
	if(localStorage !== undefined && localStorage.legacyGraphics !== undefined && localStorage.legacyGraphics === "1")
	{
		leggfx=1;
		legacyGraphics = true;
		$("#legacy_graphics").prop('checked', true);
	}
	if(localStorage !== undefined && localStorage.legacyGraphics !== undefined && localStorage.legacyGraphics === "0")
	{
		leggfx=0;
		legacyGraphics = true;
		$("#legacy_graphics").prop('checked', false);
	}
	if(localStorage !== undefined && localStorage.disableBackground !== undefined && localStorage.disableBackground === "1")
	{
		disableBackground = true;
		$("#bgimage").attr('src', "");
		$("#bgimage").css("height", "0px");
		$("#bgimage").height = 0;
		$("#bgimage").css("width", "0px");
		$("#bgimage").width = 0;
		$("#bg_toggle").prop('checked', true);
	}
	$("#bg_button").click(updateBackground);
	$("#bg_changer").keypress(function(event)
	{
		if(event.which == 13 || event.keyCode == 13)
		{
			updateBackground();
		}
	});
	$("#canvas").mousedown(function(event)
	{
		var moveWhich = swapMouse ? 1 : 3; // default = left click to Move
		var fireWhich = swapMouse ? 3 : 1; // default = right click to Shoot
		if(event.which == moveWhich)
		{
			playerMoving = true;
		}
		else if(event.which == fireWhich)
		{
			playerShooting = true;
		}
	});
	$("#canvas").mouseup(function(event)
	{
		var moveWhich = swapMouse ? 1 : 3; // default = left click to Move
		var fireWhich = swapMouse ? 3 : 1; // default = right click to Shoot
		if(event.which == moveWhich)
		{
			playerMoving = false;
		}
		else if(event.which == fireWhich)
		{
			playerShooting = false;
		}
	});
	$("#canvas").keydown(function(event)
	{
		var code = event.keyCode || e.which;
		var moveChanged = false;
		if(code == 32)
		{
			playerShooting = true;
			return false; // Prevent the Page from scrolling down when Space Key is pressed
		}
		else if(code == 87 && !keyW)
		{
			keyW = true;
			moveChanged = true;
		}
		else if(code == 83 && !keyS)
		{
			keyS = true;
			moveChanged = true;
		}
		else if(code == 65 && !keyA)
		{
			keyA = true;
			moveChanged = true;
		}
		else if(code == 68 && !keyD)
		{
			keyD = true;
			moveChanged = true;
		}
		if(moveChanged)
			socket.emit("movement",
			{
				id: id, moveRight: keyD, moveLeft: keyA, moveUp: keyW, moveDown: keyS, session: sessionID
			});
	});
	$("#canvas").keyup(function(event)
	{
		var code = event.keyCode || e.which;
		var moveChanged = false;
		if(code == 32)
		{
			playerShooting = false;
			return true;
		}
		else if(code == 87 && keyW)
		{
			keyW = false;
			moveChanged = true;
		}
		else if(code == 83 && keyS)
		{
			keyS = false;
			moveChanged = true;
		}
		else if(code == 65 && keyA)
		{
			keyA = false;
			moveChanged = true;
		}
		else if(code == 68 && keyD)
		{
			keyD = false;
			moveChanged = true;
		}
		if(moveChanged)
		{
			socket.emit("movement",
			{
				id: id, moveRight: keyD, moveLeft: keyA, moveUp: keyW, moveDown: keyS, session: sessionID
			});
		}
	});
	$("#canvas").mousemove( function(e)
	{
		var x,y;
		for(x=e.pageX-8;x>=0;x--)
		{
			if(x%blockSize===0)
			{
				mouseX = x;
				break;
			}
		}
		for(y=e.pageY-8;y>=0;y--)
		{
			if(y%blockSize===0)
			{
				mouseY = y;
				break;
			}
		}
	});
	// Disable context menu on canvas so that right clicks to fire bullets don't bring up menu
	canvas.oncontextmenu = function()
	{
		return false;
	};
	socket.emit("joinRoom",
	{
		room: 'public'
	});
	var myVar = setInterval(function()
	{
		draw();
	}, 10);
	$loginPage.fadeOut();
      $chatPage.show();
      $loginPage.off('click');
			$("#inputMessage").show();
			$("#usernameInputs").hide();
};
$(function()
{
  var FADE_TIME = 150; // ms
  var TYPING_TIMER_LENGTH = 400; // ms
  var COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];
  // Initialize varibles
  var $window = $(window);
  var $usernameInput = $('.usernameInput'); // Input for username
  var $messages = $('.messages'); // Messages area
  var $inputMessage = $('.inputMessage'); // Input message input box
  var $loginPage = $('.login.page'); // The login page
  var $chatPage = $('.chat.page'); // The chatroom page
  // Prompt for setting a username
  var username;
  var connected = false;
  var typing = false;
  var lastTypingTime;
  var $currentInput = $usernameInput.focus();
  var socket = io();
  function addParticipantsMessage (data)
	{
    var message = '';
    if (data.numUsers === 1)
		{
      message += "don't swim on a lonely stomach";
    }
		else
		{
      message += data.numUsers + " swimmers";
    }
    log(message);
  }
  // Sets the client's username
  function setUsername ()
	{
    username = 'anon';
    // If the username is valid
    if (username)
		{
						$currentInput = $inputMessage.focus();
						// Tell the server your username
						socket.emit('add user', username);
						//set the ingame username to same
						socket.emit("username",
						{
							id: id, username: username, session: sessionID
						});
			if(localStorage !== undefined)
			{
				localStorage.username = username;
			}
    }
  }
  // Sends a chat message
  function sendMessage ()
	{
    var message = $inputMessage.val();
    // Prevent markup from being injected into the message
    message = cleanInput(message);
    // if there is a non-empty message and a socket connection
    if (message && connected)
		{
      $inputMessage.val('');
      addChatMessage({
        username: username,
        message: message
      });
      // tell server to execute 'new message' and send along one parameter
      socket.emit('new message', message);
			addToLog(data.username + ' said "' + message + '"');
    }
  }
  // Log a message
  function log (message, options)
	{
    var $el = $('<li>').addClass('log').text(message);
    addMessageElement($el, options);
  }
  // Adds the visual chat message to the message list
  function addChatMessage (data, options)
	{
    // Don't fade the message in if there is an 'X was typing'
    var $typingMessages = getTypingMessages(data);
    options = options || {};
    if ($typingMessages.length !== 0)
		{
      options.fade = false;
      $typingMessages.remove();
    }
    var $usernameDiv = $('<span class="username"/>')
      .text(data.username)
      .css('color', getUsernameColor(data.username));
    var $messageBodyDiv = $('<span class="messageBody">')
      .text(data.message);
    var typingClass = data.typing ? 'typing' : '';
    var $messageDiv = $('<li class="message"/>')
      .data('username', data.username)
      .addClass(typingClass)
      .append($usernameDiv, $messageBodyDiv);
    addMessageElement($messageDiv, options);
  }
  // Adds the visual chat typing message
  function addChatTyping (data)
	{
    data.typing = true;
    data.message = 'is typing';
    addChatMessage(data);
  }
  // Removes the visual chat typing message
  function removeChatTyping (data)
	{
    getTypingMessages(data).fadeOut(function ()
		{
      $(this).remove();
    });
  }
  // Adds a message element to the messages and scrolls to the bottom
  // el - The element to add as a message
  // options.fade - If the element should fade-in (default = true)
  // options.prepend - If the element should prepend
  //   all other messages (default = false)
  function addMessageElement (el, options)
	{
    var $el = $(el);
    // Setup default options
    if (!options)
		{
      options = {};
    }
    if (typeof options.fade === 'undefined')
		{
      options.fade = true;
    }
    if (typeof options.prepend === 'undefined')
		{
      options.prepend = false;
    }
    // Apply options
    if (options.fade)
		{
      $el.hide().fadeIn(FADE_TIME);
    }
    if (options.prepend)
		{
      $messages.prepend($el);
    }
		else
		{
      $messages.append($el);
    }
    $messages[0].scrollTop = $messages[0].scrollHeight;
  }
  // Prevents input from having injected markup
  function cleanInput (input)
	{
    return $('<div/>').text(input).text();
  }
  // Updates the typing event
  function updateTyping ()
	{
    if (connected)
		{
      if (!typing)
			{
        typing = true;
        socket.emit('typing');
      }
      lastTypingTime = (new Date()).getTime();
      setTimeout(function ()
			{
        var typingTimer = (new Date()).getTime();
        var timeDiff = typingTimer - lastTypingTime;
        if (timeDiff >= TYPING_TIMER_LENGTH && typing)
				{
          socket.emit('stop typing');
          typing = false;
				}
      }, TYPING_TIMER_LENGTH);
    }
  }
  // Gets the 'X is typing' messages of a user
  function getTypingMessages (data)
	{
    return $('.typing.message').filter(function (i)
		{
      return $(this).data('username') === data.username;
    });
  }
  // Gets the color of a username through our hash function
  function getUsernameColor (username)
	{
    // Compute hash code
    var hash = 7;
    for (var i = 0; i < username.length; i++)
		{
       hash = username.charCodeAt(i) + (hash << 5) - hash;
    }
    // Calculate color
    var index = Math.abs(hash % COLORS.length);
    return COLORS[index];
  }
  // Keyboard events
  $window.keydown(function (event)
	{
    // Auto-focus the current input when a key is typed
    if (!(event.ctrlKey || event.metaKey || event.altKey))
		{
      $currentInput.focus();
    }
    // When the client hits ENTER on their keyboard
    if (event.which === 13)
		{
      if (username)
			{
        sendMessage();
        socket.emit('stop typing');
        typing = false;
      }
			else
			{
        setUsername();
      }
    }
  });
  $inputMessage.on('input', function()
	{
    updateTyping();
  });
  // Click events
  // Focus input when clicking anywhere on login page
  $loginPage.click(function ()
	{
    $currentInput.focus();
  });
  // Focus input when clicking on the message input's border
  $inputMessage.click(function ()
	{
    $inputMessage.focus();
  });
  // Socket events
  // Whenever the server emits 'login', log the login message
  socket.on('login', function (data)
	{
    connected = true;
    // Display the welcome message
    var message = "pool's closed";
    log(message, {
      prepend: true
    });
    addParticipantsMessage(data);
  });
  // Whenever the server emits 'new message', update the chat body
  socket.on('new message', function (data)
	{
    addChatMessage(data);
  });
  // Whenever the server emits 'user joined', log it in the chat body
  socket.on('user joined', function (data)
	{
    log(data.username + ' joined');
		addToLog(data.username + ' joined');
    addParticipantsMessage(data);
  });
  // Whenever the server emits 'user left', log it in the chat body
  socket.on('user left', function (data)
	{
    log(data.username + ' left');
		addToLog(data.username + ' left');
    addParticipantsMessage(data);
    removeChatTyping(data);
  });
  // Whenever the server emits 'typing', show the typing message
  socket.on('typing', function (data)
	{
    addChatTyping(data);
  });
  // Whenever the server emits 'stop typing', kill the typing message
  socket.on('stop typing', function (data)
	{
    removeChatTyping(data);
  });
	function makeArray(width, height) {
		var cells = new Array(height);

		for (var i = 0; i < height; i++) {
				cells[i] = new Array(width);

				for (var j = 0; j < width; j++) {
					cells[i][j] = 0;
				}
		}

		return cells;
	}

	function togglePixel(imageData, x, y, isOn) {
			index = (x + y * imageData.width) * 4;
			imageData.data[index+0] = isOn ? 0 : 255;
			imageData.data[index+1] = isOn ? 0 : 255;
			imageData.data[index+2] = isOn ? 0 : 255;
			imageData.data[index+3] = 255;
	}

	function clearCanvas() {
		//var canvas = document.getElementById("canvas");
		var context = canvas.getContext("2d");

		//context.clearRect(0, 0, canvas.width, canvas.height);
	}

	function initializeCells(cells, width, height, cellSize) {
		for (var cellI = 0; cellI < height; cellI += cellSize) {
				for (var cellJ = 0; cellJ < width; cellJ += cellSize) {
					var on = Math.random() < 0.50;
					if (cellI == 0 || cellI >= height-cellSize || cellJ == 0 || cellJ >= width-cellSize) {
							on = true;
					}

					for (var i = 0; i < cellSize; i++) {
							for (var j = 0; j < cellSize; j++) {
								cells[cellI + i][cellJ + j] = on ? 1 : 0;
							}
					}
				}
		}
	}

	function drawCells(cells) {
		clearCanvas();

		//var canvas = document.getElementById("canvas");
		var context = canvas.getContext("2d");
		var pixelData = context.createImageData(canvas.width, canvas.height);

		for (var i = 0; i < canvas.height; i++) {
				for (var j = 0; j < canvas.width; j++) {
					togglePixel(pixelData, i, j, cells[i][j]);
				}
		}

		context.putImageData(pixelData, 0, 0);
	}

	function applyAutomaton(cells, width, height, bornList, surviveList, numIterations) {
		var newCells = makeArray(width, height);
		var cellSize = window.cellSize;

		while (numIterations-- > 0) {
				for (var cellRow = 0; cellRow < height; cellRow += cellSize) {
					for (var cellCol = 0; cellCol < width; cellCol += cellSize) {
							var liveCondition;

							if (cellRow == 0 || cellRow >= height-cellSize || cellCol == 0 || cellCol >= width-cellSize) {
								liveCondition = true;
							} else {
								var nbhd = 0;

								nbhd += cells[cellRow-cellSize][cellCol-cellSize];
								nbhd += cells[cellRow-cellSize][cellCol];
								nbhd += cells[cellRow-cellSize][cellCol+cellSize];
								nbhd += cells[cellRow][cellCol-cellSize];
								nbhd += cells[cellRow][cellCol+cellSize];
								nbhd += cells[cellRow+cellSize][cellCol-cellSize];
								nbhd += cells[cellRow+cellSize][cellCol];
								nbhd += cells[cellRow+cellSize][cellCol+cellSize];

								// apply B678/S345678
								var currentState = cells[cellRow][cellCol];
								var liveCondition =
										(currentState == 0 && bornList.indexOf(nbhd) > -1)||
										(currentState == 1 && surviveList.indexOf(nbhd) > -1);
							}

							for (var i = 0; i < cellSize; i++) {
								for (var j = 0; j < cellSize; j++) {
										newCells[cellRow + i][cellCol + j] = liveCondition ? 1 : 0;
								}
							}
					}
				}
		}

		for (var i = 0; i < height; i++) {
				for (var j = 0; j < width; j++) {
					cells[i][j] = newCells[i][j];
				}
		}
	}

	function animate(cells, width, height, bornList, surviveList, numLeft) {
		if (numLeft == 0) {
				window.animating = false;
				return;
		}

		window.animating = true;
		applyAutomaton(cells, width, height, bornList, surviveList, 1);
		drawCells(cells);
		setTimeout(function() {animate(cells, width, height, bornList, surviveList, numLeft-1);}, 25);
	}

	function animateAutomaton(bornList, surviveList, numIters) {
		if (window.animating) {
				return;
		}

		//var canvas = document.getElementById("canvas");
		var width = canvas.width, height = canvas.height;

		animate(window.cells, width, height, bornList, surviveList, numIters);
	}

	function init() {
		//var canvas = document.getElementById("canvas");
		var width = canvas.width, height = canvas.height;
		var cells = makeArray(width, height);
		window.cellSize = width / 64;

		clearCanvas(cells);
		initializeCells(cells, width, height, window.cellSize);
		drawCells(cells);
		window.cells = cells;
	}

	function reset() {
		//var canvas = document.getElementById("canvas");
		var width = canvas.width, height = canvas.height;

		initializeCells(window.cells, width, height, window.cellSize);
		drawCells(window.cells);
	}

	function increaseResolution() {
		window.cellSize = Math.floor(window.cellSize / 2);

		if (window.cellSize == 0) {
				window.cellSize = 1;
		}
	}
	function makeArray(width, height) {
		var cells = new Array(height);

		for (var i = 0; i < height; i++) {
				cells[i] = new Array(width);

				for (var j = 0; j < width; j++) {
					cells[i][j] = 0;
				}
		}

		return cells;
	}

	function togglePixel(imageData, x, y, isOn) {
			index = (x + y * imageData.width) * 4;
			imageData.data[index+0] = isOn ? 0 : 255;
			imageData.data[index+1] = isOn ? 0 : 255;
			imageData.data[index+2] = isOn ? 0 : 255;
			imageData.data[index+3] = 255;
	}

	function clearCanvas() {
		//var canvas = document.getElementById("canvas");
		var context = canvas.getContext("2d");

		//context.clearRect(0, 0, canvas.width, canvas.height);
	}

	function initializeCells(cells, width, height, cellSize) {
		for (var cellI = 0; cellI < height; cellI += cellSize) {
				for (var cellJ = 0; cellJ < width; cellJ += cellSize) {
					var on = Math.random() < 0.50;
					if (cellI == 0 || cellI >= height-cellSize || cellJ == 0 || cellJ >= width-cellSize) {
							on = true;
					}

					for (var i = 0; i < cellSize; i++) {
							for (var j = 0; j < cellSize; j++) {
								cells[cellI + i][cellJ + j] = on ? 1 : 0;
							}
					}
				}
		}
	}

	function drawCells(cells) {
		clearCanvas();

		var canvas = document.getElementById("canvas2");
		var context = canvas.getContext("2d");
		var pixelData = context.createImageData(canvas.width, canvas.height);

		for (var i = 0; i < canvas.height; i++) {
				for (var j = 0; j < canvas.width; j++) {
					togglePixel(pixelData, i, j, cells[i][j]);
				}
		}

		context.putImageData(pixelData, 0, 0);
	}

	function applyAutomaton(cells, width, height, bornList, surviveList, numIterations) {
		var newCells = makeArray(width, height);
		var cellSize = window.cellSize;

		while (numIterations-- > 0) {
				for (var cellRow = 0; cellRow < height; cellRow += cellSize) {
					for (var cellCol = 0; cellCol < width; cellCol += cellSize) {
							var liveCondition;

							if (cellRow == 0 || cellRow >= height-cellSize || cellCol == 0 || cellCol >= width-cellSize) {
								liveCondition = true;
							} else {
								var nbhd = 0;

								nbhd += cells[cellRow-cellSize][cellCol-cellSize];
								nbhd += cells[cellRow-cellSize][cellCol];
								nbhd += cells[cellRow-cellSize][cellCol+cellSize];
								nbhd += cells[cellRow][cellCol-cellSize];
								nbhd += cells[cellRow][cellCol+cellSize];
								nbhd += cells[cellRow+cellSize][cellCol-cellSize];
								nbhd += cells[cellRow+cellSize][cellCol];
								nbhd += cells[cellRow+cellSize][cellCol+cellSize];

								// apply B678/S345678
								var currentState = cells[cellRow][cellCol];
								var liveCondition =
										(currentState == 0 && bornList.indexOf(nbhd) > -1)||
										(currentState == 1 && surviveList.indexOf(nbhd) > -1);
							}

							for (var i = 0; i < cellSize; i++) {
								for (var j = 0; j < cellSize; j++) {
										newCells[cellRow + i][cellCol + j] = liveCondition ? 1 : 0;
								}
							}
					}
				}
		}

		for (var i = 0; i < height; i++) {
				for (var j = 0; j < width; j++) {
					cells[i][j] = newCells[i][j];
				}
		}
	}

	function animate(cells, width, height, bornList, surviveList, numLeft) {
		if (numLeft == 0) {
				window.animating = false;
				return;
		}

		window.animating = true;
		applyAutomaton(cells, width, height, bornList, surviveList, 1);
		drawCells(cells);
		setTimeout(function() {animate(cells, width, height, bornList, surviveList, numLeft-1);}, 25);
	}

	function animateAutomaton(bornList, surviveList, numIters) {
		if (window.animating) {
				return;
		}

		var canvas = document.getElementById("canvas");
		var width = canvas.width, height = canvas.height;

		animate(window.cells, width, height, bornList, surviveList, numIters);
	}

	function init() {
		var canvas = document.getElementById("canvas");
		var width = canvas.width, height = canvas.height;
		var cells = makeArray(width, height);
		window.cellSize = width / 64;

		clearCanvas(cells);
		initializeCells(cells, width, height, window.cellSize);
		drawCells(cells);
		window.cells = cells;
	}

	function reset() {
		var canvas = document.getElementById("canvas");
		var width = canvas.width, height = canvas.height;

		initializeCells(window.cells, width, height, window.cellSize);
		drawCells(window.cells);
	}

	function increaseResolution() {
		window.cellSize = Math.floor(window.cellSize / 2);

		if (window.cellSize == 0) {
				window.cellSize = 1;
		}
	}
	init();animateAutomaton([6,7,8], [3,4,5,6,7,8], 20);
});
