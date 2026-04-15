# Cobble AI Dashboard

A dark-themed AI professor dashboard built with **React + Vite**.

## Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm (comes with Node.js)

### Steps to Run Locally

1. **Extract** the zip file to a folder of your choice.

2. **Open a terminal** in that folder (right-click → "Open in Terminal" or use VS Code).

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser** and navigate to:
   ```
   http://localhost:5173
   ```

That's it! 🎉

---

## Project Structure

```
src/
├── components/
│   ├── Sidebar.jsx / Sidebar.css   ← Navigation sidebar
│   ├── Topbar.jsx / Topbar.css     ← Top search bar
│   └── Layout.jsx / Layout.css     ← App shell + AI Insights popup
├── pages/
│   ├── Classes.jsx / Classes.css   ← My Classes page
│   ├── Students.jsx / Students.css ← Students roster page
│   └── Assignments.jsx / Assignments.css ← Assignments page
├── App.jsx          ← Routes configuration
└── index.css        ← Global theme & CSS variables
```

## Pages
- **`/classes`** — View and manage active classes
- **`/students`** — Student roster with flags & nudge actions
- **`/assignments`** — Upcoming assignments list

## AI Insights
Click the **"AI insights"** item in the sidebar to open the interactive AI Insights popup with a topic heatmap and confusion alert export.

## To Build for Production
```bash
npm run build
```
Output will be in the `dist/` folder.
