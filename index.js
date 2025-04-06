const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

function findRole(id) {
    if (id == playersConnection.player1) {
        return "player1";
    } else {
        return "player2";
    }
}

function opp(role) {
    if (role == "player1") {
        return "player2";
    } else {
        return "player1";
    }
}

Array.prototype.random = function () {
    return this[Math.floor(Math.random() * this.length)];
};

function drawCard() {
    let colors = [
        "r",
        "r",
        "r",
        "g",
        "g",
        "g",
        "b",
        "b",
        "b",
        "y",
        "y",
        "y",
        "a",
        "a",
    ];
    let color = colors.random();
    var cards = [];
    if (color == "a") {
        cards = [
            "block",
            "block",
            "switch color",
            "+4",
            "switch color",
            "+4",
            "+8",
        ];
    } else {
        if ([1, 1, 1, 1, 1, 0].random() == 1) {
            cards = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
        } else {
            cards = ["switch side", "ban", "+2"];
        }
    }
    let card = cards.random();

    return [color, card];
}

function deleteCard(cards, role) {
    arr = players[role];
    const target = JSON.stringify(cards);
    for (let i = 0; i < arr.length; i++) {
        if (JSON.stringify(arr[i]) === target) {
            arr.splice(i, 1);
            break;
        }
    }
    players[role] = arr;
}

function startNewGame() {
    players.player1 = [];
    players.player2 = [];
    for (var i = 0; i < 7; i++) {
        players.player1.push(drawCard());
        players.player2.push(drawCard());
    }
    field = drawCard();
    turn = ["player1", "player2"].random();

    add = 1;
}

function whoWin() {
    if (players.player1.length == 0) {
        return "player1";
    } else if (players.player2.length == 0) {
        return "player2";
    }
    return "no";
}

playersConnection = {
    player1: false,
    player2: false,
};

players = {
    player1: [
        ["r", "+2"],
        ["r", "+2"],
        ["r", "+2"],
        ["a", "+4"],
        ["a", "+4"],
        ["a", "+8"],
        ["r", "1"],
        ["a", "block"],
    ],
    player2: [
        ["r", "+2"],
        ["r", "+2"],
        ["r", "+2"],
        ["a", "+4"],
        ["a", "+4"],
        ["r", "1"],
    ],
};

field = ["r", "1"];

turn = "player1";
add = 1;
var requested = false;

io.on("connection", (socket) => {
    console.log(`connect from ${socket.id}`);
    console.log(playersConnection);

    socket.on("join", (req) => {
        if (Object.values(playersConnection).includes(false)) {
            playersConnection[
                Object.keys(playersConnection)[
                    Object.values(playersConnection).indexOf(false)
                ]
            ] = socket.id;

            let role = findRole(socket.id);

            io.to(socket.id).emit("join", "yes");
            io.to(socket.id).emit("change", {
                player: players[role],
                opponent: players[opp(role)].length,
                field: field,
                role: role == turn,
            });
        } else {
            io.to(socket.id).emit("join", "no");
        }
        console.log(playersConnection);
    });

    socket.on("use", (req) => {
        let role = findRole(socket.id);
        let op = opp(role);

        console.log(role, req);

        var doChange = true;

        if (role == turn) {
            // now player turn
            if (add > 1) {
                // now are adding
                if (
                    req[1] == "+2" ||
                    req[1] == "+4" ||
                    req[1] == "+8" ||
                    req[1] == "block"
                ) {
                    turn = op;

                    if (req[1] == "+4") {
                        field = [req[2], "+4"];
                        req.pop();
                    } else if (req[1] == "+2") {
                        field = req;
                    } else if (req[1] == "+8") {
                        field = req;
                        req.pop();
                    } else if (req[1] == "block") {
                        field = [req[2], req[1]];
                        req.pop();
                        console.log(add);
                        for (var i = 0; i < add; i++) {
                            players[op].push(drawCard());
                        }
                        add = 1;
                    }

                    if (req[1] == "+4") {
                        add += 4;
                    } else if (req[1] == "+8") {
                        add += 8;
                    } else if (req[1] == "+2") {
                        add += 2;
                    }
                } else {
                    doChange = false;
                    io.to(socket.id).emit("use", "can't use this card");
                }
            } else {
                // now are not adding
                if (
                    req[0] == field[0] ||
                    req[1] == field[1] ||
                    req[0] == "a" ||
                    field[0] == "w"
                ) {
                    // can press
                    if (req[1] == "+2") {
                        add = 0;
                        field = req;
                        add += 2;
                    } else if (req[1] == "+4") {
                        add = 0;
                        field = [req[2], "+4"];
                        add += 4;
                        req.pop();
                    } else if (req[1] == "+8") {
                        add = 0;
                        add += 8;
                        field = [req[2], "+8"];
                        req.pop();
                    } else if (req[1] == "switch color" || req[1] == "block") {
                        field = [req[2], req[1]];
                        req.pop();
                    } else if (req[1] == "ban" || req[1] == "switch side") {
                        field = req;
                    } else {
                        field = req;
                    }

                    if (req[1] != "ban" && req[1] != "switch side") {
                        turn = op;
                    }
                } else {
                    doChange = false;
                    io.to(socket.id).emit("use", "can't use this card");
                }
            }
        } else {
            doChange = false;

            io.to(socket.id).emit("use", "not your turn");
        }

        if (doChange) {
            deleteCard(req, role);
            if (req[1] != "ban" && req[1] != "switch side") {
                io.to(socket.id).emit("use", "success");
                io.to(playersConnection[op]).emit("use", "success");
            }

            io.to(socket.id).emit("change", {
                player: players[role],
                opponent: players[opp(role)].length,
                field: field,
            });
            io.to(playersConnection[op]).emit("change", {
                player: players[op],
                opponent: players[role].length,
                field: field,
            });
        }

        let winner = whoWin();
        if (winner == "player1") {
            io.to(playersConnection["player1"]).emit("gameStatus", "win");
            io.to(playersConnection["player2"]).emit("gameStatus", "lose");
        } else if (winner == "player2") {
            io.to(playersConnection["player1"]).emit("gameStatus", "lose");
            io.to(playersConnection["player2"]).emit("gameStatus", "win");
        }
    });

    socket.on("draw", (req) => {
        let role = findRole(socket.id);
        let op = opp(role);

        console.log(role, "draw");

        if (role == turn) {
            console.log(add);
            for (var i = 0; i < add; i++) {
                players[role].push(drawCard());
            }
            add = 1;

            turn = op;
            io.to(socket.id).emit("use", "success");
            io.to(playersConnection[op]).emit("use", "success");
            io.to(socket.id).emit("change", {
                player: players[role],
                opponent: players[opp(role)].length,
                field: field,
            });
            io.to(playersConnection[op]).emit("change", {
                player: players[op],
                opponent: players[role].length,
                field: field,
            });
        } else {
            io.to(socket.id).emit("draw", "not your turn");
        }
    });

    socket.on("newGame", (req) => {
        let role = findRole(socket.id);
        let op = opp(role);

        console.log(req);

        if (req == "request" && requested == false) {
            console.log("requested");
            io.to(playersConnection[op]).emit("newGame", "request");
            requested = true;
        } else if (req == "yes" && requested == true) {
            startNewGame();
            io.to(socket.id).emit("change", {
                player: players[role],
                opponent: players[opp(role)].length,
                field: field,
                role: turn == role,
            });
            io.to(playersConnection[op]).emit("change", {
                player: players[op],
                opponent: players[role].length,
                field: field,
                role: turn == op,
            });
            requested = false;
        } else if (req == "no" && requested == true) {
            requested = false;
        }
    });

    socket.on("disconnect", (reason) => {
        Object.keys(playersConnection).forEach((key) => {
            if (playersConnection[key] == socket.id) {
                playersConnection[key] = false;
            }
        });
        console.log(playersConnection);
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
