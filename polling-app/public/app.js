// Real-time Polling App JavaScript with Vote/Unvote Toggle - FIXED VERSION
let currentPollId = null;
let websocket = null;
let resultsChart = null;
let activeUsers = 0;
let currentUserId = null;
let userCurrentVote = null; // Track user's current vote

// FIXED: Generate consistent user ID
function generateUserId() {
    let userId = null;
    try {
        if (typeof Storage !== 'undefined') {
            userId = localStorage.getItem('polling_user_id');
        }
    } catch (e) {
        console.log('localStorage not available:', e);
    }
    
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        console.log('Generated new user ID:', userId);
        
        try {
            if (typeof Storage !== 'undefined') {
                localStorage.setItem('polling_user_id', userId);
                console.log('Saved user ID to localStorage');
            }
        } catch (e) {
            console.log('Could not save to localStorage:', e);
        }
    } else {
        console.log('Using existing user ID:', userId);
    }
    
    return userId;
}

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
    userCurrentVote = null; // Reset user vote
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Generate user ID when app starts
    currentUserId = generateUserId();
    debugLog('User ID: ' + currentUserId);
    
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
                userCurrentVote = null; // Reset user vote for new poll
                loadPoll(pollId);
            } else {
                throw new Error('Failed to create poll');
            }
        } catch (error) {
            showError('Failed to create poll: ' + error.message);
        }
    });
});

// Load poll
async function loadPoll(pollId) {
    try {
        showLoading();
        const response = await fetch(`/api/get?pollId=${pollId}&userId=${currentUserId}`);
        const poll = await response.json();

        if (poll.error) {
            throw new Error(poll.error);
        }

        console.log('Poll loaded:', poll);
        userCurrentVote = poll.userVote; // Set user's current vote
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
        const isUserVote = userCurrentVote === option;

        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-item fade-in' + (isUserVote ? ' user-voted' : '');
        
        // Determine button text and style
        const buttonText = isUserVote ? 'Unvote' : 'Vote';
        const buttonClass = isUserVote ? 'unvote-btn' : 'vote-btn';
        
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
    
    console.log('Displaying poll with user vote:', userCurrentVote);
    document.getElementById('createForm').classList.add('hidden');
    document.getElementById('pollDisplay').classList.remove('hidden');
}

// FIXED: Toggle vote with proper debugging
async function toggleVote(option) {
    try {
        console.log('=== TOGGLE VOTE DEBUG ===');
        console.log('Option:', option);
        console.log('Current user vote:', userCurrentVote);
        console.log('Current user ID:', currentUserId);
        console.log('Poll ID:', currentPollId);
        
        const voteData = { option, userId: currentUserId };
        console.log('Sending vote data:', voteData);
        
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
        console.log('Vote result:', result);

        // FIXED: Update local state immediately
        console.log('Previous userCurrentVote:', userCurrentVote);
        userCurrentVote = result.userVote;
        console.log('New userCurrentVote:', userCurrentVote);

        // FIXED: Update UI immediately 
        updateButtonStates();
        showVoteAnimation(option, result.action);
        
        console.log('=== END TOGGLE VOTE DEBUG ===');

    } catch (error) {
        console.error('Vote error:', error);
        showError('Failed to vote: ' + error.message);
    }
}

// FIXED: Update button states based on user's current vote
function updateButtonStates() {
    console.log('Updating button states, userCurrentVote:', userCurrentVote);
    const optionItems = document.querySelectorAll('.option-item');
    
    optionItems.forEach(item => {
        const option = item.querySelector('.option-text').textContent;
        const button = item.querySelector('.vote-btn, .unvote-btn');
        const isUserVote = userCurrentVote === option;
        
        console.log(`Option: ${option}, isUserVote: ${isUserVote}`);
        
        // Update button appearance
        button.className = isUserVote ? 'unvote-btn' : 'vote-btn';
        button.textContent = isUserVote ? 'Unvote' : 'Vote';
        
        // Update item appearance
        item.className = 'option-item fade-in' + (isUserVote ? ' user-voted' : '');
    });
}

// Show vote animation
function showVoteAnimation(option, action) {
    const button = document.querySelector(`[data-option="${option}"]`);
    if (button) {
        const originalText = button.textContent;
        
        // Show feedback based on action
        switch (action) {
            case 'vote':
                button.textContent = 'Voted!';
                button.style.background = 'linear-gradient(135deg, #20c997 0%, #28a745 100%)';
                break;
            case 'unvote':
                button.textContent = 'Removed!';
                button.style.background = 'linear-gradient(135deg, #fd7e14 0%, #dc3545 100%)';
                break;
            case 'switch':
                button.textContent = 'Switched!';
                button.style.background = 'linear-gradient(135deg, #007bff 0%, #6610f2 100%)';
                break;
        }
        
        setTimeout(() => {
            updateButtonStates(); // Reset to proper state
            button.style.background = ''; // Reset style
        }, 1500);
    }
}

// Connect WebSocket
function connectWebSocket(pollId) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${pollId}?userId=${currentUserId}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = function() {
        console.log('WebSocket connected');
        activeUsers++;
        updateActiveUsers();
    };
    
    websocket.onmessage = function(event) {
        console.log('WebSocket message received:', event.data);
        const data = JSON.parse(event.data);
        
        if (data.type === 'vote_update') {
            console.log('Vote update received:', data);
            
            // FIXED: Only update userCurrentVote if it's for our user
            if (data.voterId === currentUserId || !data.voterId) {
                console.log('Updating userCurrentVote from WebSocket:', data.userVote);
                userCurrentVote = data.userVote;
                updateButtonStates(); // Update button states
            }
            
            updateVotes(data.votes, data.total);
            updateStatistics(data.votes, data.total);
            updateChart(data.votes);
            
        } else if (data.type === 'poll_data') {
            console.log('Poll data received:', data);
            
            // Set user's current vote from server
            userCurrentVote = data.userVote;
            
            displayPoll({
                question: data.poll.question,
                options: data.poll.options,
                votes: data.votes,
                total: data.total,
                userVote: data.userVote
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

// FIXED: Create chart with proper cleanup
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