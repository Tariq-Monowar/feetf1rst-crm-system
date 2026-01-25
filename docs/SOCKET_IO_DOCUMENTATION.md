# Socket.IO - Quick Start Guide for Frontend

## 🚀 Quick Setup

```javascript
import io from 'socket.io-client';

// Connect to server
const socket = io('http://localhost:1971', {
  path: '/socket.io',
  reconnection: true,
});

// After user login, join with user ID
socket.emit('join', userId);
```

---

## 📤 Send Events (Client → Server)

### 1. Join User Room (After Login)
```javascript
socket.emit('join', userId);
// Example: socket.emit('join', '0793a7e1-24c7-45b1-97d4-c06e35a5e6d0');
```

### 2. Join Conversation (When Opening Chat)
```javascript
socket.emit('joinConversation', conversationId);
```

### 3. Show Typing Indicator
```javascript
socket.emit('typing', {
  conversationId: 'abc123',
  userId: 'user-id',
  userName: 'John Doe'
});
```

### 4. Hide Typing Indicator
```javascript
socket.emit('stopTyping', {
  conversationId: 'abc123',
  userId: 'user-id'
});
```

---

## 📥 Receive Events (Server → Client)

### 1. New Message Received
```javascript
socket.on('newMessage', (message) => {
  // message structure:
  // {
  //   id: string,
  //   conversationId: string,
  //   content: string,
  //   sender: { id, name, email, image },
  //   createdAt: string,
  //   reply: [...],  // array of replied messages
  //   isRead: boolean
  // }
  
  // Add message to chat UI
  addMessageToChat(message);
});
```

### 2. Someone is Typing
```javascript
socket.on('typing', (data) => {
  // data: { conversationId, userId, userName }
  showTypingIndicator(data.userName);
});
```

### 3. Someone Stopped Typing
```javascript
socket.on('stopTyping', (data) => {
  // data: { conversationId, userId }
  hideTypingIndicator();
});
```

---

## 💬 How to Send a Message

**Important:** Don't send messages via Socket.IO. Use REST API instead.

```javascript
// 1. Send message via REST API
const response = await fetch('/api/v2/partner-chat/send-message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    conversationId: 'abc123',
    content: 'Hello!',
    reply: []  // Optional: array of message IDs if replying
  })
});

// 2. Server will automatically broadcast via Socket.IO
// You'll receive it in the 'newMessage' event listener
```

---

## 📝 Complete Example

```javascript
import io from 'socket.io-client';

class ChatSocket {
  constructor(userId) {
    this.socket = io('http://localhost:1971', {
      path: '/socket.io',
      reconnection: true
    });
    
    this.userId = userId;
    this.currentConversationId = null;
    this.setupListeners();
    this.joinUserRoom();
  }

  setupListeners() {
    // Listen for new messages
    this.socket.on('newMessage', (message) => {
      this.onNewMessage(message);
    });

    // Listen for typing indicators
    this.socket.on('typing', (data) => {
      this.onTyping(data);
    });

    this.socket.on('stopTyping', (data) => {
      this.onStopTyping(data);
    });
  }

  joinUserRoom() {
    this.socket.emit('join', this.userId);
  }

  openConversation(conversationId) {
    this.currentConversationId = conversationId;
    this.socket.emit('joinConversation', conversationId);
  }

  // Call this when user types
  showTyping(userName) {
    if (!this.currentConversationId) return;
    
    this.socket.emit('typing', {
      conversationId: this.currentConversationId,
      userId: this.userId,
      userName: userName
    });
  }

  // Call this when user stops typing or sends message
  hideTyping() {
    if (!this.currentConversationId) return;
    
    this.socket.emit('stopTyping', {
      conversationId: this.currentConversationId,
      userId: this.userId
    });
  }

  // Implement these methods in your component
  onNewMessage(message) {
    // Add message to UI
    console.log('New message:', message);
  }

  onTyping(data) {
    // Show "User is typing..."
    console.log('User typing:', data.userName);
  }

  onStopTyping(data) {
    // Hide typing indicator
    console.log('User stopped typing');
  }
}

// Usage
const chat = new ChatSocket(userId);

// When user opens a conversation
chat.openConversation(conversationId);

// When user types (with debounce)
let typingTimeout;
inputElement.addEventListener('input', () => {
  chat.showTyping(userName);
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    chat.hideTyping();
  }, 3000); // Auto-hide after 3 seconds
});

// When user sends message
sendButton.addEventListener('click', async () => {
  await sendMessageViaAPI(conversationId, messageText);
  chat.hideTyping(); // Stop typing indicator
});
```

---

## 🎯 React Hook Example

```javascript
import { useEffect, useRef } from 'react';
import io from 'socket.io-client';

export function useChatSocket(userId, conversationId) {
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect
    socketRef.current = io('http://localhost:1971', {
      path: '/socket.io',
      reconnection: true
    });

    const socket = socketRef.current;

    // Join user room
    socket.emit('join', userId);

    // Join conversation
    if (conversationId) {
      socket.emit('joinConversation', conversationId);
    }

    // Listen for messages
    socket.on('newMessage', (message) => {
      // Update your state here
      console.log('New message:', message);
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, [userId, conversationId]);

  return {
    socket: socketRef.current,
    emitTyping: (userName) => {
      if (socketRef.current && conversationId) {
        socketRef.current.emit('typing', {
          conversationId,
          userId,
          userName
        });
      }
    },
    emitStopTyping: () => {
      if (socketRef.current && conversationId) {
        socketRef.current.emit('stopTyping', {
          conversationId,
          userId
        });
      }
    }
  };
}

// Usage in component
function ChatComponent({ userId, conversationId }) {
  const { emitTyping, emitStopTyping } = useChatSocket(userId, conversationId);

  return (
    <div>
      <input 
        onInput={() => emitTyping('Your Name')}
        onBlur={emitStopTyping}
      />
    </div>
  );
}
```

---

## ✅ Checklist

- [ ] Connect Socket.IO after user login
- [ ] Emit `join` with user ID after connection
- [ ] Emit `joinConversation` when user opens a chat
- [ ] Listen for `newMessage` event to update UI
- [ ] Use REST API to send messages (not Socket.IO)
- [ ] Show typing indicator when user types
- [ ] Hide typing indicator when user stops or sends message
- [ ] Disconnect Socket.IO when user logs out

---

## 🔧 Common Issues

**Messages not appearing?**
- Make sure you called `joinConversation(conversationId)`
- Check if Socket.IO is connected: `socket.connected`

**Typing indicator not working?**
- Make sure you're in the conversation room
- Check browser console for errors

**Connection fails?**
- Check if server is running on port 1971
- Verify CORS settings allow your frontend URL

---

## 📋 Event Summary

| What | Event Name | When to Use |
|------|------------|-------------|
| Join user room | `socket.emit('join', userId)` | After login |
| Join conversation | `socket.emit('joinConversation', id)` | When opening chat |
| Show typing | `socket.emit('typing', {...})` | When user types |
| Hide typing | `socket.emit('stopTyping', {...})` | When user stops |
| Receive message | `socket.on('newMessage', ...)` | Always listen |
| Receive typing | `socket.on('typing', ...)` | Always listen |

---

**That's it!** 🎉

For questions, check the server logs or contact backend team.
