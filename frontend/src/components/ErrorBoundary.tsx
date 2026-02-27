import React from 'react';

function Fallback({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) {
  return (
    <div role="alert" className="p-4 bg-red-100 text-red-700 border border-red-200 m-4 rounded">
      <h2 className="font-bold">Something went wrong in the UI:</h2>
      <pre className="text-sm mt-2">{error.message}</pre>
      <button onClick={resetErrorBoundary} className="mt-4 px-4 py-2 bg-red-600 text-white rounded">
        Try again
      </button>
    </div>
  );
}

export default Fallback;
