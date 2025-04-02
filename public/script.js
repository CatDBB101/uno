const socket = io();

var field = ["r", "2"];
var add = 0;
var switchColorType = "";

socket.emit("join", "join");

socket.on("join", (data) => {
    console.log(data);
});

var successSound = new Audio("./successSound.mp3");

socket.on("change", (data) => {
    console.log(data);

    let player_cards = document.querySelector(".player-cards");
    clearChild(player_cards);
    data.player.forEach((element) => {
        player_cards.innerHTML += `<div class="card ${
            element[0]
        }" onclick='use("${element[0]}", "${element[1]}")'>${displayCard(
            element[1]
        )}</div>`;
    });

    let opp_cards = document.querySelector(".opponent-cards");
    clearChild(opp_cards);
    for (let i = 0; i < data.opponent; i++) {
        opp_cards.innerHTML += `<div class="card a">UNO</div>`;
    }

    let _field = document.getElementById("field");
    _field.setAttribute("class", `card ${displayCard(data.field[0])}`);
    _field.innerText = displayCard(data.field[1]);
    field = data.field;

    add = data.add;

    if (data.role != null) {
        let turnElement = document.querySelector(".turn");
        turnElement.innerText = data.role ? "Your" : "Opponent";
        if (turnElement.innerText == "Your") {
            successSound.play();
        }
    }
});

function use(color, card) {
    if (
        card == "switch color" ||
        card == "+4" ||
        card == "+8" ||
        card == "block"
    ) {
        var modal = document.getElementById("myModal");
        modal.style.display = "block";
        switchColorType = card;
    } else {
        socket.emit("use", [color, card]);
    }
}

socket.on("use", (data) => {
    if (data == "can't use this card") {
        alert("You can't use this card");
    } else if (data == "not your turn") {
        alert("Now is not your turn");
    } else if (data == "success") {
        let turnElement = document.querySelector(".turn");
        turnElement.innerText =
            turnElement.innerText == "Your" ? "Opponent" : "Your";
        if (turnElement.innerText == "Your") {
            successSound.play();
        }
    }
});

function draw() {
    socket.emit("draw", "draw");
}

socket.on("draw", (data) => {
    console.log(data);
    if (data == "not your turn") {
        alert("Now is not your turn");
    }
    if (data == "success") {
        let turnElement = document.querySelector(".turn");
        turnElement.innerText =
            turnElement.innerText == "Your" ? "Opponent" : "Your";
        if (turnElement.innerText == "Your") {
            successSound.play();
        }
    }
});

function newGame() {
    socket.emit("newGame", "request");
}

socket.on("newGame", (data) => {
    if (data == "request") {
        if (confirm("Do you wanna start new game ?")) {
            socket.emit("newGame", "yes");
        } else {
            socket.emit("newGame", "no");
        }
    }
});

socket.on("gameStatus", (data) => {
    if (data == "win") {
        alert("Game ended, You win!!!");
    } else if (data == "lose") {
        alert("Game ended, You lose :(");
    }
});

function displayCard(card) {
    if (card == "switch side") {
        return "♻️";
    } else if (card == "ban") {
        return "🚫";
    } else if (card == "switch color") {
        return "🌈";
    } else if (card == "block") {
        return "🛡️";
    }
    return card;
}

function clearChild(e) {
    let child = e.lastElementChild;
    while (child) {
        e.removeChild(child);
        child = e.lastElementChild;
    }
}

var span = document.getElementsByClassName("close")[0];
var modal = document.getElementById("myModal");
span.onclick = function () {
    modal.style.display = "none";
    switchColorType = "";
};

function useSwitch(color) {
    modal.style.display = "none";
    socket.emit("use", ["a", switchColorType, color]);
}
