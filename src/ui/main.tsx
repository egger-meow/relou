import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
const PublicApp = lazy(()=>import('./public').then(module=>({default:module.PublicApp})));
const AdminApp = lazy(()=>import('./admin').then(module=>({default:module.AdminApp})));
import './styles.css';

const isAdmin = window.location.hostname === 'admin.relou.jjmowlab.com';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Suspense fallback={<p role="status">載入中…</p>}>{isAdmin ? <AdminApp/> : <PublicApp/>}</Suspense></React.StrictMode>
);
