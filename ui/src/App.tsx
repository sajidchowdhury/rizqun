import { cn } from '@/lib/utils';

function App() {
  return (
    <div
      className={cn(
        'min-h-screen bg-gradient-to-br from-slate-50 to-slate-200',
        'flex items-center justify-center p-8',
      )}
    >
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-slate-900">Rizqun UI</h1>
        <p className="mt-4 text-lg text-slate-600">
          Operator console for the Rizqun order management API.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Phase 0.1 scaffold — Vite + React + TypeScript + Tailwind v4 ready.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="rounded-md bg-emerald-100 px-3 py-1 font-medium text-emerald-700">
            Vite
          </span>
          <span className="rounded-md bg-sky-100 px-3 py-1 font-medium text-sky-700">React 19</span>
          <span className="rounded-md bg-indigo-100 px-3 py-1 font-medium text-indigo-700">
            TypeScript
          </span>
          <span className="rounded-md bg-teal-100 px-3 py-1 font-medium text-teal-700">
            Tailwind v4
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
