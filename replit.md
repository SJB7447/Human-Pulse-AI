# Human Pulse - AI Interactive News Service

## Overview

Human Pulse is an AI-powered interactive news service that visualizes emotions through Web 3D graphics. The application presents news articles categorized by emotional tone (joy, anger, sadness, fear, calm) using an immersive Three.js-based interface with animated emotion spheres and particle systems. Users can explore news content by clicking on emotion spheres, which triggers animated transitions to emotion-specific news feeds.

**Design Concept**: "Digital Healing & Emotional Balance" - Relaxing, Fluid, Glassmorphism, Dreamy Light

## User Preferences

Preferred communication style: Simple, everyday language.
Korean localization for UI elements.

## Color Palette (Design System)

- **Anger (Coral Red)**: `#f4606b` / Pastel: `#ffc7ce`
- **Joy (Yellow)**: `#ffd150` / Pastel: `#f9e1a5`
- **Calm (Green)**: `#88d84a` / Pastel: `#b8f498`
- **Sadness (Light Navy)**: `#3f65ef` / Pastel: `#bdcaef`
- **Fear (Gray)**: `#bababa` / Pastel: `#e5e5e5`
- **Text Main**: `#232221`
- **Text Sub**: `#999898`
- **Text Disabled**: `#d6d6d6`

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: Zustand for managing emotion selection states and animation phases
- **3D Graphics**: React Three Fiber (R3F) with drei helpers for Three.js integration
- **Animation**: Framer Motion for UI animations, react-spring for 3D animations
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **UI Components**: shadcn/ui component library with Radix UI primitives

### Backend Architecture
- **Runtime**: Node.js with Express
- **API Design**: RESTful endpoints serving emotion and news data
- **Development Server**: Vite middleware integration for hot module replacement

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` defines users and newsItems tables
- **Current Storage**: In-memory storage implementation with seeded news data (can migrate to PostgreSQL)

### Key Design Patterns
- **Monorepo Structure**: Client (`client/`), server (`server/`), and shared code (`shared/`) in single repository
- **Path Aliases**: `@/` for client source, `@shared/` for shared code
- **Component Organization**: UI components in `components/ui/`, 3D components in `components/three/`
- **Type Safety**: Shared TypeScript types between frontend and backend via `shared/schema.ts`

## Application Routes

- `/` - Landing page with 3D emotion spheres
- `/emotion/:type` - Emotion-specific news feed (joy, anger, sadness, fear, calm)
- `/mypage` - User profile, saved articles, custom articles
- `/journalist` - Journalist portal with AI writing tools
- `/admin` - Admin dashboard with analytics and content management

## Core Features

### Phase 1: Intro & 3D Scene
- **Intro Overlay**: "오늘 당신의 색은 어떤 색인가요?" text with fade animation
- **Main Sphere**: Gray sphere (size 3.2) that splits into 5 emotion spheres on click
- **Emotion Spheres**: Pentagon formation (desktop) / Vertical zig-zag (mobile), MeshDistortMaterial with hover labels
- **Two-Step Click Navigation**: First click = Focus (camera zooms in), Second click = Navigate to emotion page
- **Visual Hierarchy**: Fear (gray) sphere is larger (1.3x desktop, 0.9x mobile) than other spheres
- **Mobile Responsiveness**: Vertical layout on screens < 768px with adjusted camera zoom (Z=11 vs Z=18)
- **Particle System**: 50 particles with absorption effect - fade out when reaching spheres
- **Animation Phases**: intro → initial → splitting → idle → focusing → focused → transitioning (merging for back)

### Phase 2: Global AI Assistant (Pulse Bot)
- Floating button (bottom-right) visible on all pages
- Real-time chat UI with Korean responses
- Proactive check-in messages every 30 seconds
- Location: `client/src/components/PulseBot.tsx`

### Phase 3: User System (My Page)
- User profile editing
- Saved articles list with emotion indicators
- Custom AI-generated articles management
- Settings tab for profile configuration

### Phase 4: Journalist Portal
- Keyword search with trending topics
- AI draft generation and typo/compliance checking
- Media tools (image upload, video upload, AI image generation)
- Multi-platform distribution (Interactive, 동아일보, Instagram, YouTube, Threads)
- AI SEO helper with hashtag generation
- Sentiment balance gauge with warning for unbalanced content

### Phase 5: Admin Dashboard
- Overview statistics (views, saves, users, articles)
- Emotion distribution pie chart
- Top articles ranking
- Platform distribution stats
- Reported content management with risk scores
- Data export (Excel, PDF)

### 3D Scene Architecture
- Five emotion spheres in pentagon formation using MeshDistortMaterial
- Particles use meshPhysicalMaterial for performance (50 particles, 16 segments)
- Camera controller handles zoom transitions
- Environment preset="warehouse" with realistic lighting

### Editorial Glassmorphism Design (Emotion News Page)
- **Typography**: Playfair Display serif font for headlines, Inter for UI
- **Layout**: Hero Article (full width) + multi-column grid (3 columns on lg breakpoint)
- **Card Style**: Frosted glass effect with backdrop-blur, emotion-colored top border
- **Navigation**: Minimalist sticky header with backdrop-blur
- **Author Section**: Circular avatars with journalist names
- **Interactions**: Uses hover-elevate utility instead of custom shadows

### News Detail Modal
- Glassmorphism styled modal with dark semi-transparent background
- Triple-layered box-shadow glow effect using emotion color with pulsing animation
- Action buttons: 저장하기 (Save), 공유하기 (Share), 나만의 기사 (AI transformation)
- Location: `client/src/components/NewsDetailModal.tsx`

### News Data Schema
- Fields: id, title, summary, content, source, image, category, emotion, intensity, createdAt
- 20 pre-seeded articles with Unsplash images across all emotion types

## External Dependencies

### Database
- PostgreSQL via Drizzle ORM (requires `DATABASE_URL` environment variable)
- Drizzle Kit for schema migrations (`drizzle-kit push`)

### Key NPM Packages
- `@react-three/fiber` and `@react-three/drei` for 3D rendering
- `@tanstack/react-query` for server state management
- `framer-motion` for UI animations
- `zustand` for client state management
- `express` with `express-session` for backend API
- `drizzle-orm` and `drizzle-zod` for database operations and validation
- `@fontsource/playfair-display` and `@fontsource/merriweather` for editorial typography

### Replit-Specific
- `@replit/vite-plugin-runtime-error-modal` for error display
- `@replit/vite-plugin-cartographer` and `@replit/vite-plugin-dev-banner` for development features
