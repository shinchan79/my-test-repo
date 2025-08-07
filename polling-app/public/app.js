// Real-time Polling App JavaScript with Multi-Vote Support - COMPLETE FIXED VERSION
let currentPollId = null;
let websocket = null;
let resultsChart = null;
let activeUsers = 0;
let userCurrentVotes = []; // Track user's current votes as array

// FIXED: Generate unique user ID for each tab/session
function generateUserId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 12);
    const tabRandom = Math.floor(Math.random() * 999999);
    const sessionId = `user_${timestamp}_${random}_${tabRandom}`;
    
    console.log('🆔 Generated UNIQUE user ID:', sessionId);
    return sessionId;
}

// Initialize user ID immediately when script loads
const currentUserId = generateUserId();
console.log('🚀 Current User ID:', currentUserId);

// Debug function
function debugLog(message) {
    console.log('[DEBUG]', message);
}

// Generate a random poll ID
function generatePollId() {
    return 'poll_' + Math.random().toString(36).substr(2, 9);
}

// Add option input
function addOption() {
    const container = document.getElementById('optionsContainer');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'option-input';
    input.placeholder = 'Option ' + (container.children.length + 1);
    input.required = true;
    container.appendChild(input);
}

// Show create form
function showCreateForm() {
    document.getElementById('createForm').classList.remove('hidden');
    document.getElementById('pollDisplay').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    if (websocket) {
        websocket.close();
        websocket = null;
    }
    if (resultsChart) {
        resultsChart.destroy();
        resultsChart = null;
    }
    userCurrentVotes = [];
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    debugLog('🚀 App initialized with User ID: ' + currentUserId);
    
    // Show user ID in UI for debugging
    showUserInfo();
    
    document.getElementById('pollForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const question = document.getElementById('question').value;
        const options = Array.from(document.querySelectorAll('.option-input'))
            .map(input => input.value.trim())
            .filter(option => option.length > 0);

        if (options.length < 2) {
            showError('Please add at least 2 options');
            return;
        }

        const pollId = generatePollId();
        currentPollId = pollId;

        try {
            showLoading();
            const response = await fetch('/api/create?pollId=' + pollId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, options })
            });

            if (response.ok) {
                console.log('Poll created successfully, loading poll...');
                userCurrentVotes = [];
                loadPoll(pollId);
            } else {
                throw new Error('Failed to create poll');
            }
        } catch (error) {
            showError('Failed to create poll: ' + error.message);
        }
    });
});

// Show user info for debugging
function showUserInfo() {
    const header = document.querySelector('.header');
    const userInfo = document.createElement('div');
    userInfo.style.cssText = `
        position: absolute;
        top: 10px;
        right: 20px;
        background: rgba(255,255,255,0.2);
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 12px;
        backdrop-filter: blur(10px);
        max-width: 200px;
        word-break: break-all;
        z-index: 10;
    `;
    userInfo.innerHTML = `👤 ${currentUserId}`;
    header.style.position = 'relative';
    header.appendChild(userInfo);
}

// FIXED: Load poll with forced userId
async function loadPoll(pollId) {
    try {
        showLoading();
        
        // FORCE send userId in API request
        const url = `/api/get?pollId=${pollId}&userId=${encodeURIComponent(currentUserId)}`;
        console.log('📥 Loading poll with URL:', url);
        
        const response = await fetch(url);
        const poll = await response.json();

        if (poll.error) {
            throw new Error(poll.error);
        }

        console.log('📊 Poll loaded:', poll);
        userCurrentVotes = poll.userVotes || [];
        displayPoll(poll);
        connectWebSocket(pollId);
        updatePollLink(pollId);
        hideLoading();
    } catch (error) {
        showError('Failed to load poll: ' + error.message);
        hideLoading();
    }
}

// Display poll
function displayPoll(poll) {
    document.getElementById('pollQuestion').textContent = poll.question;
    
    const optionsContainer = document.getElementById('pollOptions');
    optionsContainer.innerHTML = '';

    const total = poll.total || 0;

    poll.options.forEach(option => {
        const votes = poll.votes[option] || 0;
        const percentage = total > 0 ? (votes / total * 100).toFixed(1) : 0;
        const isUserVoted = userCurrentVotes.includes(option);

        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-item fade-in' + (isUserVoted ? ' user-voted' : '');
        
        const buttonText = isUserVoted ? 'Unvote' : 'Vote';
        const buttonClass = isUserVoted ? 'unvote-btn' : 'vote-btn';
        
        optionDiv.innerHTML = `
            <div class="option-text">${option}</div>
            <button class="${buttonClass}" data-option="${option}">${buttonText}</button>
            <div class="vote-count">${votes} votes</div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
        `;
        
        // Add event listener to vote/unvote button
        const actionBtn = optionDiv.querySelector('.vote-btn, .unvote-btn');
        actionBtn.addEventListener('click', function() {
            const option = this.getAttribute('data-option');
            debugLog('Action button clicked for option: ' + option);
            toggleVote(option);
        });
        
        optionsContainer.appendChild(optionDiv);
    });

    updateStatistics(poll.votes, total);
    createChart(poll.options, poll.votes);
    
    console.log('Displaying poll with user votes:', userCurrentVotes);
    document.getElementById('createForm').classList.add('hidden');
    document.getElementById('pollDisplay').classList.remove('hidden');
}

// FIXED: Toggle vote with forced userId
async function toggleVote(option) {
    try {
        console.log('=== VOTE DEBUG ===');
        console.log('🆔 Using User ID:', currentUserId);
        console.log('🗳️ Option:', option);
        console.log('📋 Current votes:', userCurrentVotes);
        console.log('🎯 Expected action:', userCurrentVotes.includes(option) ? 'UNVOTE' : 'VOTE');
        
        // FORCE send userId from frontend
        const voteData = { 
            option, 
            userId: currentUserId  // Always send our generated userId
        };
        console.log('📤 Sending:', JSON.stringify(voteData));
        
        const response = await fetch('/api/vote?pollId=' + currentPollId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(voteData)
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Vote error response:', errorText);
            throw new Error('Failed to vote: ' + response.status);
        }

        const result = await response.json();
        console.log('📥 Response:', JSON.stringify(result));
        console.log('🔄 Action performed:', result.action);
        console.log('📊 New user votes:', result.userVotes);

        // Update local state
        const oldVotes = [...userCurrentVotes];
        userCurrentVotes = result.userVotes || [];
        console.log(`🔄 Local state: [${oldVotes.join(', ')}] → [${userCurrentVotes.join(', ')}]`);

        // Update UI
        updateButtonStates();
        showVoteAnimation(option, result.action);
        
        console.log('=== END VOTE DEBUG ===');

    } catch (error) {
        console.error('Vote error:', error);
        showError('Failed to vote: ' + error.message);
    }
}

// Update button states based on user's current votes array
function updateButtonStates() {
    console.log('Updating button states, userCurrentVotes:', userCurrentVotes);
    const optionItems = document.querySelectorAll('.option-item');
    
    optionItems.forEach(item => {
        const option = item.querySelector('.option-text').textContent;
        const button = item.querySelector('.vote-btn, .unvote-btn');
        const isUserVoted = userCurrentVotes.includes(option);
        
        console.log(`Option: ${option}, isUserVoted: ${isUserVoted}`);
        
        // Update button appearance
        button.className = isUserVoted ? 'unvote-btn' : 'vote-btn';
        button.textContent = isUserVoted ? 'Unvote' : 'Vote';
        
        // Update item appearance
        item.className = 'option-item fade-in' + (isUserVoted ? ' user-voted' : '');
    });
}

// Show vote animation
function showVoteAnimation(option, action) {
    const button = document.querySelector(`[data-option="${option}"]`);
    if (button) {
        console.log(`🎬 Animation: ${option} → ${action}`);
        
        switch (action) {
            case 'vote':
                button.textContent = 'Voted!';
                button.style.background = 'linear-gradient(135deg, #20c997 0%, #28a745 100%)';
                break;
            case 'unvote':
                button.textContent = 'Removed!';
                button.style.background = 'linear-gradient(135deg, #fd7e14 0%, #dc3545 100%)';
                break;
        }
        
        setTimeout(() => {
            updateButtonStates();
            button.style.background = '';
        }, 1500);
    }
}

// FIXED: Connect WebSocket with forced userId
function connectWebSocket(pollId) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // FORCE send userId in WebSocket URL
    const wsUrl = `${protocol}//${window.location.host}/ws/${pollId}?userId=${encodeURIComponent(currentUserId)}`;
    
    console.log('🔌 WebSocket URL:', wsUrl);
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = function() {
        console.log('✅ WebSocket connected');
        activeUsers++;
        updateActiveUsers();
    };
    
    websocket.onmessage = function(event) {
        console.log('WebSocket message received:', event.data);
        const data = JSON.parse(event.data);
        
        if (data.type === 'vote_update') {
            console.log('🗳️ Vote update from:', data.voterId);
            console.log('🆔 Our user ID:', currentUserId);
            console.log('🔍 Vote update data:', data);
            
            // Only update our votes if it's from our user
            if (data.voterId === currentUserId) {
                console.log('🔄 Updating our votes from WebSocket:', data.userVotes);
                userCurrentVotes = data.userVotes || [];
                updateButtonStates();
            } else {
                console.log('👥 Vote from other user, ignoring user vote state update');
            }
            
            updateVotes(data.votes, data.total);
            updateStatistics(data.votes, data.total);
            updateChart(data.votes);
            
        } else if (data.type === 'poll_data') {
            console.log('📊 Poll data received:', data);
            
            // Set user's current votes from server
            userCurrentVotes = data.userVotes || [];
            
            displayPoll({
                question: data.poll.question,
                options: data.poll.options,
                votes: data.votes,
                total: data.total,
                userVotes: data.userVotes
            });
        } else if (data.type === 'user_count') {
            activeUsers = data.count;
            updateActiveUsers();
        }
    };

    websocket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };

    websocket.onclose = function() {
        console.log('WebSocket connection closed');
        activeUsers = Math.max(0, activeUsers - 1);
        updateActiveUsers();
        
        // Try to reconnect after 3 seconds
        setTimeout(() => {
            if (currentPollId) {
                connectWebSocket(currentPollId);
            }
        }, 3000);
    };
}

// Update votes display
function updateVotes(votes, total) {
    const optionsContainer = document.getElementById('pollOptions');
    const optionItems = optionsContainer.querySelectorAll('.option-item');

    optionItems.forEach((item) => {
        const option = item.querySelector('.option-text').textContent;
        const votesCount = votes[option] || 0;
        const percentage = total > 0 ? (votesCount / total * 100).toFixed(1) : 0;

        item.querySelector('.vote-count').textContent = votesCount + ' votes';
        item.querySelector('.progress-fill').style.width = percentage + '%';
    });

    document.getElementById('totalVotes').textContent = total;
}

// Update statistics
function updateStatistics(votes, total) {
    document.getElementById('totalVotes').textContent = total;
    updateActiveUsers();
}

// Update active users
function updateActiveUsers() {
    document.getElementById('activeUsers').textContent = activeUsers;
}

// Create chart with proper cleanup
function createChart(options, votes) {
    // Destroy existing chart if exists
    if (resultsChart) {
        resultsChart.destroy();
        resultsChart = null;
    }
    
    const ctx = document.getElementById('resultsChart').getContext('2d');
    
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe',
        '#00f2fe', '#43e97b', '#38f9d7', '#fa709a', '#fee140'
    ];

    resultsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: options,
            datasets: [{
                data: options.map(option => votes[option] || 0),
                backgroundColor: colors.slice(0, options.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            size: 14
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${context.parsed} votes (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true
            }
        }
    });
}

// Update chart
function updateChart(votes) {
    if (resultsChart) {
        const options = resultsChart.data.labels;
        resultsChart.data.datasets[0].data = options.map(option => votes[option] || 0);
        resultsChart.update('active');
    }
}

// Update poll link
function updatePollLink(pollId) {
    const pollLink = window.location.origin + '/?poll=' + pollId;
    document.getElementById('pollLink').textContent = pollLink;
}

// Copy poll link
function copyPollLink() {
    const pollLink = document.getElementById('pollLink').textContent;
    navigator.clipboard.writeText(pollLink).then(() => {
        const btn = document.querySelector('.btn-share');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = 'linear-gradient(135deg, #20c997 0%, #28a745 100%)';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        }, 2000);
    }).catch(err => {
        showError('Failed to copy link');
    });
}

// Share on Twitter
function shareOnTwitter() {
    const pollLink = document.getElementById('pollLink').textContent;
    const question = document.getElementById('pollQuestion').textContent;
    const text = `Check out this poll: "${question}" ${pollLink}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Show loading
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('pollDisplay').classList.add('hidden');
    document.getElementById('createForm').classList.add('hidden');
}

// Hide loading
function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// Show error
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    hideLoading();
}

// Hide error
function hideError() {
    document.getElementById('error').classList.add('hidden');
}

// Check if URL has poll ID
window.addEventListener('load', function() {
    debugLog('Page loaded, checking for poll ID...');
    const urlParams = new URLSearchParams(window.location.search);
    const pollId = urlParams.get('poll');
    
    if (pollId) {
        debugLog('Found poll ID in URL: ' + pollId);
        currentPollId = pollId;
        loadPoll(pollId);
    } else {
        debugLog('No poll ID in URL, ready to create new poll');
    }
});

// Track votes for analytics
function trackVote(option, action) {
    console.log('Vote tracked:', { option, action, userId: currentUserId });
}