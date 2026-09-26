export default function LoadingScreen({ label = "Loading your marketplace" }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-5">
        <div className="relative w-11 h-11">
          <div className="absolute inset-0 rounded-xl bg-primary animate-spin [animation-duration:1.1s]" />
          <div className="absolute inset-[3px] rounded-lg bg-canvas" />
        </div>
        <p className="text-sm font-semibold text-muted tracking-tight">{label}</p>
      </div>
    </div>
  );
}
