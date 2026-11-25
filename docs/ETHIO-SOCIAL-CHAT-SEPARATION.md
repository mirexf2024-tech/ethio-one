# Ethio Social / Ethio Chat — Product Boundary

## Decision

Ethio Social and Ethio Chat are separate products inside ETHIO ONE. A user must not need to open Ethio Social to send or read a private message.

## Ethio Social owns

- Public and follower feed
- Create, edit and delete posts
- Photos, videos and stories
- Reactions, comments and sharing
- Follow / unfollow and public member profiles
- Post discovery, saved posts, reports and moderation
- Social notifications for reactions, comments and follows

## Ethio Social must not own

- Private one-to-one conversations or inbox
- Group messaging or group conversation history
- Message composer, message attachments or message search
- Read receipts, typing indicators or message delivery state
- Voice messages or chat-specific audio/video calls
- Message notification preferences or conversation controls

The Social interface must not expose a Messages / Inbox navigation item, a New Message action, or a direct-message action on member profiles. Do not delete or disable public comments; comments remain part of Social posts.

## Ethio Chat owns

- One-to-one private conversations
- Group chats and group membership/roles
- Text, image, video and file messages
- Voice messages
- Conversation search, unread state and read receipts
- Typing and delivery indicators
- Chat-specific notifications and privacy/block controls
- Audio/video calls that are part of a conversation, if supported

Ethio Chat must use the shared Ethio ID and account identity. It must not duplicate registration or create a separate user identity.

## Migration and compatibility requirements

1. Preserve existing conversation records, message history, attachments, group membership and call records.
2. Move or expose existing messaging functionality through the Ethio Chat service and its own route/screen; do not drop tables or delete records as part of the UI separation.
3. Update Social member profiles so they offer Follow and View Profile actions, not Message.
4. Remove Social inbox and private/group messaging UI, event handlers, translations and notification settings only after the corresponding Ethio Chat destination is available and verified.
5. Keep post comments and replies inside Social. They are public/social interactions, not private chat.
6. Route message notifications to Ethio Chat. Keep likes, comments, follows and post activity notifications in Social.
7. Deep links to existing conversations must resolve to Ethio Chat; legacy links must not silently lose their destination.
8. Enforce service ownership on the server. Hiding a button is not authorization.

## Acceptance checks

- Social has no inbox, new-message, private conversation or group-chat entry point.
- Social still supports feed, posts, stories, likes/reactions, comments, shares, follows and moderation.
- Ethio Chat opens a user's existing one-to-one and group conversations.
- Existing messages and attachments remain accessible after separation.
- A Social user can follow a member without starting a conversation.
- A user can open Ethio Chat directly from the ETHIO ONE services dashboard.
- OM / AM / EN labels are present for both services.
- Tests verify that Social post comments still work and private-message endpoints are owned by Ethio Chat.
