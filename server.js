const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Game state
const gameState = {
    players: {},
    deck: [],
    discardPile: [],
    currentPlayer: null,
    gameStarted: false,
    direction: 1, // 1 for clockwise, -1 for counter-clockwise
    currentColor: null,
    currentValue: null,
    waitingForColor: false,
};

// UNO card colors and values
const COLORS = ["red", "blue", "green", "yellow"];
const VALUES = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "skip",
    "reverse",
    "draw2",
];
const WILD_CARDS = ["wild", "wild_draw4"];

// Initialize the deck
function initializeDeck() {
    const deck = [];

    // Add colored cards (two of each except 0)
    COLORS.forEach((color) => {
        VALUES.forEach((value) => {
            deck.push({ color, value });
            if (value !== "0") {
                deck.push({ color, value });
            }
        });
    });

    // Add wild cards (4 of each)
    WILD_CARDS.forEach((value) => {
        for (let i = 0; i < 4; i++) {
            deck.push({ color: "wild", value });
        }
    });

    return shuffleDeck(deck);
}

// Shuffle the deck
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], [deck[i]]];
    }
    return deck;
}

// Deal cards to players
function dealCards() {
    for (let i = 0; i < 7; i++) {
        Object.keys(gameState.players).forEach((playerId) => {
            const card = gameState.deck.pop();
            gameState.players[playerId].hand.push(card);
        });
    }
}

// Start the game
function startGame() {
    gameState.deck = initializeDeck();
    gameState.discardPile = [];
    gameState.gameStarted = true;
    gameState.direction = 1;
    gameState.waitingForColor = false;

    // Deal cards
    dealCards();

    // Start the discard pile
    let firstCard;
    do {
        firstCard = gameState.deck.pop();
    } while (firstCard.color === "wild"); // Don't start with a wild card

    gameState.discardPile.push(firstCard);
    gameState.currentColor = firstCard.color;
    gameState.currentValue = firstCard.value;

    // Choose random starting player
    const playerIds = Object.keys(gameState.players);
    gameState.currentPlayer =
        playerIds[Math.floor(Math.random() * playerIds.length)];

    // Notify players
    io.emit("gameStarted", {
        currentPlayer: gameState.currentPlayer,
        topCard: gameState.discardPile[gameState.discardPile.length - 1],
        direction: gameState.direction,
    });

    // Send hands to players
    Object.keys(gameState.players).forEach((playerId) => {
        io.to(playerId).emit("yourHand", gameState.players[playerId].hand);
    });
}

// Handle socket connections
io.on("connection", (socket) => {
    console.log(`New connection: ${socket.id}`);

    // Add player to the game
    socket.on("joinGame", (playerName) => {
        if (Object.keys(gameState.players).length >= 2) {
            socket.emit("error", "Game is full (2 players maximum)");
            return;
        }

        gameState.players[socket.id] = {
            name: playerName,
            hand: [],
            socket: socket,
        };

        socket.emit("joinedGame", { playerId: socket.id, playerName });
        io.emit("playerJoined", { playerId: socket.id, playerName });

        // If we have 2 players, start the game
        if (
            Object.keys(gameState.players).length === 2 &&
            !gameState.gameStarted
        ) {
            startGame();
        }
    });

    // Handle playing a card
    socket.on("playCard", (cardIndex) => {
        const player = gameState.players[socket.id];
        if (
            !player ||
            gameState.currentPlayer !== socket.id ||
            gameState.waitingForColor
        ) {
            socket.emit("error", "Not your turn or invalid action");
            return;
        }

        const card = player.hand[cardIndex];
        if (!card) {
            socket.emit("error", "Invalid card");
            return;
        }

        // Check if the card is playable
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        if (
            card.color !== "wild" &&
            card.color !== gameState.currentColor &&
            card.value !== gameState.currentValue
        ) {
            socket.emit("error", "Card cannot be played");
            return;
        }

        // Remove card from player's hand and add to discard pile
        player.hand.splice(cardIndex, 1);
        gameState.discardPile.push(card);

        // Update game state
        gameState.currentColor = card.color === "wild" ? null : card.color;
        gameState.currentValue = card.value;

        // Handle special cards
        if (card.color === "wild") {
            gameState.waitingForColor = true;
            socket.emit("chooseColor");
        } else {
            handleCardEffect(card);
            nextTurn();
        }

        // Broadcast the played card (but hide wild card color choice until selected)
        io.emit("cardPlayed", {
            playerId: socket.id,
            card:
                card.color === "wild"
                    ? { color: "wild", value: card.value }
                    : card,
            waitingForColor: card.color === "wild",
        });

        // Check for UNO or win condition
        if (player.hand.length === 1) {
            io.emit("uno", { playerId: socket.id });
        } else if (player.hand.length === 0) {
            io.emit("gameOver", { winner: socket.id, winnerName: player.name });
            resetGame();
            return;
        }

        // Send updated hand to player
        socket.emit("yourHand", player.hand);
    });

    // Handle color choice for wild cards
    socket.on("chooseColor", (color) => {
        if (
            gameState.waitingForColor &&
            gameState.currentPlayer === socket.id &&
            COLORS.includes(color)
        ) {
            gameState.currentColor = color;
            gameState.waitingForColor = false;

            const card =
                gameState.discardPile[gameState.discardPile.length - 1];
            handleCardEffect(card);
            nextTurn();

            io.emit("colorChosen", { color, playerId: socket.id });
        }
    });

    // Handle drawing a card
    socket.on("drawCard", () => {
        const player = gameState.players[socket.id];
        if (
            !player ||
            gameState.currentPlayer !== socket.id ||
            gameState.waitingForColor
        ) {
            socket.emit("error", "Not your turn or invalid action");
            return;
        }

        if (gameState.deck.length === 0) {
            // Reshuffle discard pile (except top card) if deck is empty
            const topCard = gameState.discardPile.pop();
            gameState.deck = shuffleDeck(gameState.discardPile);
            gameState.discardPile = [topCard];
        }

        const card = gameState.deck.pop();
        player.hand.push(card);

        socket.emit("cardDrawn", card);
        socket.emit("yourHand", player.hand);

        // Automatically end turn after drawing
        nextTurn();
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log(`Player disconnected: ${socket.id}`);
        if (gameState.players[socket.id]) {
            io.emit("playerLeft", {
                playerId: socket.id,
                playerName: gameState.players[socket.id].name,
            });
            delete gameState.players[socket.id];

            if (Object.keys(gameState.players).length < 2) {
                resetGame();
            }
        }
    });
});

// Handle special card effects
function handleCardEffect(card) {
    const playerIds = Object.keys(gameState.players);
    const currentIndex = playerIds.indexOf(gameState.currentPlayer);

    switch (card.value) {
        case "skip":
            // Skip next player's turn
            break;
        case "reverse":
            // Reverse direction (but in 2-player game, this acts like a skip)
            gameState.direction *= -1;
            break;
        case "draw2":
            // Next player draws 2 cards
            const nextPlayerId =
                playerIds[
                    (currentIndex + gameState.direction + playerIds.length) %
                        playerIds.length
                ];
            const nextPlayer = gameState.players[nextPlayerId];

            for (let i = 0; i < 2; i++) {
                if (gameState.deck.length === 0) {
                    const topCard = gameState.discardPile.pop();
                    gameState.deck = shuffleDeck(gameState.discardPile);
                    gameState.discardPile = [topCard];
                }
                nextPlayer.hand.push(gameState.deck.pop());
            }

            io.to(nextPlayerId).emit("yourHand", nextPlayer.hand);
            io.emit("playerDrewCards", { playerId: nextPlayerId, count: 2 });
            break;
        case "wild_draw4":
            // Next player draws 4 cards
            const nextPlayerId4 =
                playerIds[
                    (currentIndex + gameState.direction + playerIds.length) %
                        playerIds.length
                ];
            const nextPlayer4 = gameState.players[nextPlayerId4];

            for (let i = 0; i < 4; i++) {
                if (gameState.deck.length === 0) {
                    const topCard = gameState.discardPile.pop();
                    gameState.deck = shuffleDeck(gameState.discardPile);
                    gameState.discardPile = [topCard];
                }
                nextPlayer4.hand.push(gameState.deck.pop());
            }

            io.to(nextPlayerId4).emit("yourHand", nextPlayer4.hand);
            io.emit("playerDrewCards", { playerId: nextPlayerId4, count: 4 });
            break;
    }
}

// Move to next player's turn
function nextTurn() {
    const playerIds = Object.keys(gameState.players);
    const currentIndex = playerIds.indexOf(gameState.currentPlayer);
    gameState.currentPlayer =
        playerIds[
            (currentIndex + gameState.direction + playerIds.length) %
                playerIds.length
        ];

    io.emit("turnChanged", {
        currentPlayer: gameState.currentPlayer,
        topCard: gameState.discardPile[gameState.discardPile.length - 1],
        currentColor: gameState.currentColor,
    });
}

// Reset the game
function resetGame() {
    gameState.players = {};
    gameState.deck = [];
    gameState.discardPile = [];
    gameState.currentPlayer = null;
    gameState.gameStarted = false;
    gameState.direction = 1;
    gameState.currentColor = null;
    gameState.currentValue = null;
    gameState.waitingForColor = false;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
