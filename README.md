# Legal Intake AI Explorer

A sophisticated, AI-powered legal intake application that automates initial client interviews using Google's generative AI models and Real-Time Voice API.

## 🚀 The Architecture & Flow

This application is designed to feel highly premium and empathetic, minimizing robotic interactions while maximizing the collection of hard legal facts.

### 1. The Dashboard (Link Generation)
Law firms start at the `/` Dashboard to generate unique, secure, and time-expiring intake links for prospective clients.

### 2. The Pre-Chat Form
When a client opens their link, they are greeted with a mandatory glassmorphic modal form. This form collects:
- First Name & Last Name
- Email Address
- Phone Number
- **Short Description of the Issue** (e.g., "I slipped at a grocery store" or "Real estate deed dispute")

*Why? By collecting contact information upfront, we prevent the Voice AI from aggressively or loopingly demanding personal details during the call, allowing it to focus entirely on the legal investigation.*

### 3. Dynamic Roadmap Generation (Google Search Grounding)
The moment the form is submitted, the app runs a hidden background process:
- It sends the client's "Short Description" to the `gemini-3-flash-preview` model.
- It enables **Google Search Grounding**, giving the AI live internet access.
- The AI researches the specific legal topic and instantly generates a highly structured **Interrogation Roadmap** consisting of the exact questions a top-tier lawyer would ask for that specific scenario.

### 4. Real-Time Voice Interview
The client enters the Interview Room and starts the call.
- The app establishes a WebSocket connection to the Real-Time Audio API using the stable `gemini-2.5-flash-native-audio-preview-12-2025` model.
- The system prompt is injected with the client's contact details (so it can greet them by name) and the dynamically generated Interrogation Roadmap.
- The AI acts as a human investigator, conducting a fluid, natural voice-to-voice conversation to uncover the hard facts, dates, and potential red flags outlined in the roadmap.

### 5. Instant Case Summarization
Once the call concludes, the entire transcript is sent back to the ultra-smart `gemini-3-flash-preview` model. It processes the conversation and outputs a strictly formatted HTML summary for the lawyer to review, containing:
- **CLIENT OVERVIEW:** Contact details and incident date.
- **CORE ISSUE:** The main legal problem.
- **KEY FACTS:** A bulleted breakdown of discoveries.
- **POTENTIAL RED FLAGS:** Missing evidence, statute of limitations warnings, etc.

---

## 🛠️ Tech Stack
- **Frontend Framework:** React + Vite
- **Styling:** Custom CSS (Glassmorphic, Modern, Responsive)
- **Voice / Audio:** Native Web Audio API (`AudioWorklet`) with 16kHz linear downsampling and a MediaRecorder polyfill fallback for browser compatibility.
- **AI Models:** `@google/genai` SDK
    - Speech-to-Text / Grounding / Summarization: `gemini-3-flash-preview`
    - Live WebSocket Voice Streaming: `gemini-2.5-flash-native-audio-preview-12-2025`

## ⚙️ Local Development Setup

1. **Clone the repository.**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your Gemini API Key:
   ```env
   VITE_GEMINI_API_KEY="your_google_studio_api_key_here"
   ```
4. **Run the development server:**
   ```bash
   npm run dev
   ```
5. Open `http://localhost:5173` in your browser.
