# Cursor-Based Pagination Guide

## Overview
The messages endpoint uses **cursor-based pagination** instead of traditional page-based pagination. This is perfect for infinite scroll and chat applications.

## Endpoint
```
GET /messages/:conversationId
```

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 20 | Number of messages to fetch |
| `cursor` | string | No | null | Cursor from previous response (base64 encoded) |

## Request Examples

### First Request (Load Initial Messages)
```http
GET /messages/conv-123?limit=20
```

### Load Older Messages (Scroll Up)
```http
GET /messages/conv-123?limit=20&cursor=eyJjcmVhdGVkQXQiOiIyMDI1LTAxLTIwVDEwOjAwOjAwLjAwMFoiLCJpZCI6Im1zZy0xMjMifQ==
```

## Response Format

```json
{
  "success": true,
  "message": "Messages retrieved successfully",
  "data": [
    {
      "id": "msg-123",
      "conversationId": "conv-123",
      "content": "Hello!",
      "isEdited": false,
      "messageType": "Normal",
      "reply": [],
      "createdAt": "2025-01-20T10:00:00.000Z",
      "updatedAt": "2025-01-20T10:00:00.000Z",
      "isRead": true,
      "sender": {
        "id": "user-456",
        "name": "John Doe",
        "email": "john@example.com",
        "image": "https://..."
      }
    }
  ],
  "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI1LTAxLTIwVDEwOjAwOjAwLjAwMFoiLCJpZCI6Im1zZy0xMjMifQ==",
  "hasMore": true
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `data` | Message[] | Array of messages (oldest first) |
| `nextCursor` | string \| null | Cursor to fetch older messages. `null` if no more messages |
| `hasMore` | boolean | `true` if more messages available, `false` otherwise |

## Frontend Implementation

### React Example

```typescript
import { useState, useEffect } from 'react';

interface Message {
  id: string;
  content: string;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  // ... other fields
}

interface MessagesResponse {
  success: boolean;
  data: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

function ChatMessages({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  // Load initial messages
  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  const loadMessages = async (cursor: string | null = null) => {
    if (loading || (!hasMore && cursor)) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (cursor) params.append('cursor', cursor);

      const response = await fetch(
        `/messages/${conversationId}?${params.toString()}`
      );
      const data: MessagesResponse = await response.json();

      if (cursor) {
        // Append older messages at the beginning
        setMessages((prev) => [...data.data, ...prev]);
      } else {
        // Initial load - replace all messages
        setMessages(data.data);
      }

      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load older messages when scrolling up
  const loadOlderMessages = () => {
    if (hasMore && nextCursor) {
      loadMessages(nextCursor);
    }
  };

  return (
    <div>
      {/* Scroll to top button or infinite scroll trigger */}
      {hasMore && (
        <button onClick={loadOlderMessages} disabled={loading}>
          {loading ? 'Loading...' : 'Load Older Messages'}
        </button>
      )}

      {/* Messages list */}
      <div>
        {messages.map((msg) => (
          <div key={msg.id}>{msg.content}</div>
        ))}
      </div>
    </div>
  );
}
```

### Infinite Scroll Example

```typescript
const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const element = e.currentTarget;
  
  // Load older messages when scrolled to top
  if (element.scrollTop === 0 && hasMore && nextCursor && !loading) {
    loadOlderMessages();
  }
};

<div onScroll={handleScroll} style={{ overflowY: 'auto', height: '500px' }}>
  {messages.map((msg) => (
    <MessageComponent key={msg.id} message={msg} />
  ))}
</div>
```

## Important Notes

1. **Order**: Messages are returned in **ascending order** (oldest first)
   - First request: Gets the oldest messages
   - Subsequent requests: Get even older messages

2. **Cursor Usage**:
   - First request: Don't send `cursor` parameter
   - Next requests: Use `nextCursor` from previous response
   - If `nextCursor` is `null`, there are no more messages

3. **No Duplicates**: Cursor ensures no duplicate messages between requests

4. **hasMore vs nextCursor**:
   - `hasMore: true` → More messages available, use `nextCursor`
   - `hasMore: false` → No more messages, `nextCursor` will be `null`

5. **Limit**: Default is 20, you can change it (e.g., `limit=50`)

## Error Handling

```typescript
try {
  const response = await fetch(`/messages/${conversationId}?limit=20`);
  const data = await response.json();
  
  if (!data.success) {
    console.error('Error:', data.message);
    return;
  }
  
  // Use data.data, data.nextCursor, data.hasMore
} catch (error) {
  console.error('Network error:', error);
}
```

## Quick Reference

```typescript
// ✅ First load
GET /messages/conv-123?limit=20

// ✅ Load older messages
GET /messages/conv-123?limit=20&cursor=<nextCursor_from_response>

// ❌ Don't use page parameter (not supported)
GET /messages/conv-123?page=2  // Wrong!
```
