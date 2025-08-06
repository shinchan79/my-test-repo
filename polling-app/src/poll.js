export class Poll {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.votes = new Map();
    this.pollData = null;
    this.userVotes = new Map(); // Track user votes: userId -> option
    
    console.log('Poll Durable Object initialized');
    
    // Load data from storage
    this.state.blockConcurrencyWhile(async () => {
      const storedPollData = await this.state.storage.get('pollData');
      const storedVotes = await this.state.storage.get('votes');
      const storedUserVotes = await this.state.storage.get('userVotes');
      
      if (storedPollData) {
        this.pollData = storedPollData;
        console.log('Loaded poll data:', storedPollData);
      }
      
      if (storedVotes) {
        this.votes = new Map(Object.entries(storedVotes));
        console.log('Loaded votes:', Object.fromEntries(this.votes));
      }

      if (storedUserVotes) {
        this.userVotes = new Map(Object.entries(storedUserVotes));
        console.log('Loaded user votes:', Object.fromEntries(this.userVotes));
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
    this.votes.clear();
    this.userVotes.clear(); // Clear user votes when creating new poll
    data.options.forEach(option => {
      this.votes.set(option, 0);
    });

    console.log('Created poll with options:', data.options);
    console.log('Initialized votes:', Object.fromEntries(this.votes));

    // Persist to state
    await this.state.storage.put('pollData', this.pollData);
    await this.state.storage.put('votes', Object.fromEntries(this.votes));
    await this.state.storage.put('userVotes', Object.fromEntries(this.userVotes));

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
    const { option, userId } = data;
    
    // FIXED: Use provided userId or generate consistent fallback
    const voterId = userId || 'anonymous_' + (request.headers.get('CF-Connecting-IP') || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    
    console.log('=== VOTE HANDLER ===');
    console.log('Option:', option);
    console.log('UserId from request:', userId);
    console.log('Final voterId:', voterId);
    console.log('Current user votes:', Object.fromEntries(this.userVotes));
    console.log('Available options:', Array.from(this.votes.keys()));
    
    if (!this.votes.has(option)) {
      console.log('Invalid option:', option);
      return new Response(JSON.stringify({ error: "Invalid option" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Check if user has already voted for this option
    const currentUserVote = this.userVotes.get(voterId);
    let action = 'vote';

    console.log('Current user vote for', voterId, ':', currentUserVote);

    if (currentUserVote === option) {
      // FIXED: User is unvoting the same option
      console.log('UNVOTING: User clicked same option');
      const currentVotes = this.votes.get(option);
      this.votes.set(option, Math.max(0, currentVotes - 1));
      this.userVotes.delete(voterId);
      action = 'unvote';
      console.log('User unvoted option:', option);
    } else {
      // User is voting for a new option or switching vote
      if (currentUserVote) {
        // FIXED: Remove vote from previous option (switch vote)
        console.log('SWITCHING: From', currentUserVote, 'to', option);
        const prevVotes = this.votes.get(currentUserVote);
        this.votes.set(currentUserVote, Math.max(0, prevVotes - 1));
        console.log('Removed vote from previous option:', currentUserVote);
        action = 'switch';
      } else {
        console.log('NEW VOTE: First time voting');
        action = 'vote';
      }
      
      // Add vote to new option
      const currentVotes = this.votes.get(option);
      this.votes.set(option, currentVotes + 1);
      this.userVotes.set(voterId, option);
      console.log('User voted for option:', option);
    }
    
    console.log('Final action:', action);
    console.log('Updated votes:', Object.fromEntries(this.votes));
    console.log('Updated user votes:', Object.fromEntries(this.userVotes));
    
    // Persist votes to storage
    await this.state.storage.put('votes', Object.fromEntries(this.votes));
    await this.state.storage.put('userVotes', Object.fromEntries(this.userVotes));
    
    // Broadcast update to all connected clients
    const total = Array.from(this.votes.values()).reduce((a, b) => a + b, 0);
    const broadcastData = {
      type: "vote_update",
      votes: Object.fromEntries(this.votes),
      total,
      userVote: this.userVotes.get(voterId) || null,
      action,
      voterId // Add for debugging
    };
    
    console.log('Broadcasting:', broadcastData);
    this.broadcast(broadcastData);

    return new Response(JSON.stringify({ 
      success: true, 
      action,
      userVote: this.userVotes.get(voterId) || null,
      total,
      voterId // Add for debugging
    }), {
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

    // Get userId to check current user's vote
    const userId = new URL(request.url).searchParams.get('userId') || 
                   'anonymous_' + (request.headers.get('CF-Connecting-IP') || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');

    const total = Array.from(this.votes.values()).reduce((a, b) => a + b, 0);
    
    const response = {
      ...this.pollData,
      votes: Object.fromEntries(this.votes),
      total,
      userVote: this.userVotes.get(userId) || null
    };
    
    console.log('Returning poll data for userId:', userId, 'userVote:', response.userVote);
    
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });
  }

  async handleWebSocket(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    const sessionId = crypto.randomUUID();
    const userId = new URL(request.url).searchParams.get('userId') || 
                   'anonymous_' + (request.headers.get('CF-Connecting-IP') || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    
    this.sessions.set(sessionId, { socket: server, userId });

    console.log('WebSocket connection established:', { sessionId, userId });
    console.log('Total sessions:', this.sessions.size);

    // Send initial data
    if (this.pollData) {
      const total = Array.from(this.votes.values()).reduce((a, b) => a + b, 0);
      const initialData = {
        type: "poll_data",
        poll: this.pollData,
        votes: Object.fromEntries(this.votes),
        total,
        userVote: this.userVotes.get(userId) || null,
        userId
      };
      console.log('Sending initial data for userId:', userId, 'userVote:', initialData.userVote);
      server.send(JSON.stringify(initialData));
    }

    // Send user count update
    this.broadcast({
      type: "user_count",
      count: this.sessions.size
    });

    server.addEventListener("close", () => {
      console.log('WebSocket connection closed:', { sessionId, userId });
      this.sessions.delete(sessionId);
      this.broadcast({
        type: "user_count",
        count: this.sessions.size
      });
    });

    server.addEventListener("error", () => {
      console.log('WebSocket error:', { sessionId, userId });
      this.sessions.delete(sessionId);
      this.broadcast({
        type: "user_count",
        count: this.sessions.size
      });
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    console.log('Broadcasting message to', this.sessions.size, 'sessions:', message.type);
    
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      try {
        sessionData.socket.send(messageStr);
      } catch (e) {
        console.log('Failed to send message to session:', sessionId, e);
        this.sessions.delete(sessionId);
      }
    }
  }
}