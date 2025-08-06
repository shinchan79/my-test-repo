// Demo script để test Polling App
// Chạy: node demo.js

const BASE_URL = 'http://localhost:8787'; // Thay đổi nếu deploy production

async function testPollingApp() {
    console.log('🧪 Testing Polling App...\n');

    // Test 1: Tạo poll mới
    console.log('1. Creating a new poll...');
    const pollId = 'demo_poll_' + Date.now();
    const createResponse = await fetch(`${BASE_URL}/api/create?pollId=${pollId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: 'What is your favorite programming language?',
            options: ['JavaScript', 'Python', 'Java', 'Go', 'Rust']
        })
    });

    if (createResponse.ok) {
        console.log('✅ Poll created successfully!');
    } else {
        console.log('❌ Failed to create poll');
        return;
    }

    // Test 2: Lấy thông tin poll
    console.log('\n2. Getting poll information...');
    const getResponse = await fetch(`${BASE_URL}/api/get?pollId=${pollId}`);
    const pollData = await getResponse.json();
    
    if (pollData.error) {
        console.log('❌ Failed to get poll:', pollData.error);
        return;
    }

    console.log('✅ Poll data retrieved:');
    console.log(`   Question: ${pollData.question}`);
    console.log(`   Options: ${pollData.options.join(', ')}`);
    console.log(`   Total votes: ${pollData.total}`);

    // Test 3: Vote cho các options
    console.log('\n3. Voting for options...');
    const options = pollData.options;
    
    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        console.log(`   Voting for: ${option}`);
        
        const voteResponse = await fetch(`${BASE_URL}/api/vote?pollId=${pollId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ option })
        });

        if (voteResponse.ok) {
            console.log(`   ✅ Voted for ${option}`);
        } else {
            console.log(`   ❌ Failed to vote for ${option}`);
        }

        // Đợi 1 giây giữa các votes
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Test 4: Lấy kết quả cuối cùng
    console.log('\n4. Getting final results...');
    const finalResponse = await fetch(`${BASE_URL}/api/get?pollId=${pollId}`);
    const finalData = await finalResponse.json();

    console.log('✅ Final results:');
    console.log(`   Total votes: ${finalData.total}`);
    Object.entries(finalData.votes).forEach(([option, votes]) => {
        const percentage = ((votes / finalData.total) * 100).toFixed(1);
        console.log(`   ${option}: ${votes} votes (${percentage}%)`);
    });

    // Test 5: WebSocket connection (simulation)
    console.log('\n5. Testing WebSocket connection...');
    console.log('   WebSocket URL:', `ws://localhost:8787/ws/${pollId}`);
    console.log('   💡 Open browser console and run:');
    console.log(`   const ws = new WebSocket('ws://localhost:8787/ws/${pollId}');`);
    console.log('   ws.onmessage = (event) => console.log(JSON.parse(event.data));');

    console.log('\n🎉 Demo completed!');
    console.log(`📊 View poll at: ${BASE_URL}/?poll=${pollId}`);
}

// Test với error handling
testPollingApp().catch(error => {
    console.error('❌ Demo failed:', error.message);
    console.log('\n💡 Make sure the app is running with: npm run dev');
}); 