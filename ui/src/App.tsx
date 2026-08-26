import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { routes } from '@/routes';
import { Toaster } from '@/components/ui/sonner';

const router = createBrowserRouter(routes);

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}

export default App;
