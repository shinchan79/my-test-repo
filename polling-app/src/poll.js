export class Poll {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.votes = new Map();
    this.pollData = null;
    
    console.log('Poll Durable Object initialized');
    
    // Load data from storage
    this.state.blockConcurrencyWhile(async () => {
      const storedPollData = await this.state.storage.get('pollData');
      const storedVotes = await this.state.storage.get('votes');
      
      if (storedPollData) {
        this.pollData = storedPollData;
        console.log('Loaded poll data:', storedPollData);
      }
      
      if (storedVotes) {
        this.votes = new Map(Object.entries(storedVotes));
        console.log('Loaded votes:', Object.fromEntries(this.votes));
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    switch (url.pathname) {
      case "/vote":
        return this.handleVote(request);
      case "/get":
        return this.handleGetPoll(request);
      case "/create":
        return this.handleCreatePoll(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  async handleCreatePoll(request) {
    const data = await request.json();
    this.pollData = {
      id: data.id,
      question: data.question,
      options: data.options,
      created: Date.now()
    };
    
    // Initialize votes for each option
    this.votes.clear(); // Clear existing votes
    data.options.forEach(option => {
      this.votes.set(option, 0);
    });

    console.log('Created poll with options:', data.options);
    console.log('Initialized votes:', Object.fromEntries(this.votes));

    // Persist to state
    await this.state.storage.put('pollData', this.pollData);
    await this.state.storage.put('votes', Object.fromEntries(this.votes));

    // Broadcast initial data to any connected clients
    this.broadcast({
      type: "poll_data",
      poll: this.pollData,
      votes: Object.fromEntries(this.votes),
      total: 0
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  async handleVote(request) {
    const data = await request.json();
    const { option } = data;
    
    console.log('Vote received for option:', option);
    console.log('Available options:', Array.from(this.votes.keys()));
    
    if (!this.votes.has(option)) {
      console.log('Invalid option:', option);
      return new Response(JSON.stringify({ error: "Invalid option" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Increment vote count
    const currentVotes = this.votes.get(option) || 0;
    this.votes.set(option, currentVotes + 1);
    
    console.log('Updated votes:', Object.fromEntries(this.votes));
    
    // Persist votes to storage
    await this.state.storage.put('votes', Object.fromEntries(this.votes));
    
    // Broadcast update to all connected clients
    this.broadcast({
      type: "vote_update",
      votes: Object.fromEntries(this.votes),
      total: Array.from(this.votes.values()).reduce((a, b) => a + b, 0)
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  async handleGetPoll(request) {
    if (!this.pollData) {
      return new Response(JSON.stringify({ error: "Poll not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const total = Array.from(this.votes.values()).reduce((a, b) => a + b, 0);
    
    const response = {
      ...this.pollData,
      votes: Object.fromEntries(this.votes),
      total
    };
    
    console.log('Returning poll data:', response);
    
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });
  }

  async handleWebSocket(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, server);

    console.log('WebSocket connection established, session ID:', sessionId);
    console.log('Total sessions:', this.sessions.size);

    // Send initial data
    if (this.pollData) {
      const total = Array.from(this.votes.values()).reduce((a, b) => a + b, 0);
      const initialData = {
        type: "poll_data",
        poll: this.pollData,
        votes: Object.fromEntries(this.votes),
        total
      };
      console.log('Sending initial data:', initialData);
      server.send(JSON.stringify(initialData));
    } else {
      console.log('No poll data available for WebSocket');
    }

    // Send user count update
    this.broadcast({
      type: "user_count",
      count: this.sessions.size
    });

    server.addEventListener("close", () => {
      console.log('WebSocket connection closed, session ID:', sessionId);
      this.sessions.delete(sessionId);
      // Send updated user count
      this.broadcast({
        type: "user_count",
        count: this.sessions.size
      });
    });

    server.addEventListener("error", () => {
      console.log('WebSocket error, session ID:', sessionId);
      this.sessions.delete(sessionId);
      // Send updated user count
      this.broadcast({
        type: "user_count",
        count: this.sessions.size
      });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    console.log('Broadcasting message to', this.sessions.size, 'sessions:', message);
    
    for (const session of this.sessions.values()) {
      try {
        session.send(messageStr);
      } catch (e) {
        console.log('Failed to send message to session:', e);
        // Session might be closed, ignore
      }
    }
  }
} 