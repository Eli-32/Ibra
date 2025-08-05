import axios from 'axios';

async function checkBotStatus() {
  try {
    const response = await axios.get('https://ibra-41d8.onrender.com/health');
    console.log('✅ Bot is healthy:', response.data);
    
    const statusResponse = await axios.get('https://ibra-41d8.onrender.com/');
    console.log('📊 Bot status:', statusResponse.data);
    
  } catch (error) {
    console.log('❌ Bot health check failed:', error.message);
  }
}

// Check status every 30 seconds
setInterval(checkBotStatus, 30000);
checkBotStatus(); // Initial check

console.log('🔍 Bot monitor started. Checking status every 30 seconds...'); 