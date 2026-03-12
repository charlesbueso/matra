# Matra 🌳

A living tree of your ancestry — record family conversations, let AI extract stories and relationships, and watch your family tree grow.

## Stack

- **Mobile**: React Native (Expo Router) + Reanimated + Skia
- **Backend**: Supabase (Postgres, Auth, Edge Functions)
- **AI**: Anthropic, OpenAI, Groq for transcription & biography generation

## Quick Start

```powershell
powershell -ExecutionPolicy Bypass -File dev.ps1
```

This starts Docker, Supabase, Edge Functions, the Android emulator, and Expo in one command.

## Project Structure

```
backend/    Supabase config, Edge Functions, migrations
mobile/     Expo app (screens, components, stores, services)
dev.ps1     One-command dev environment launcher
```
