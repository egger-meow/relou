import React from 'react';
import { createRoot } from 'react-dom/client';
import { PublicApp } from './public';
import { AdminApp } from './admin';
import './styles.css';

const isAdmin = window.location.hostname === 'admin.relou.jjmowlab.com';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isAdmin ? <AdminApp/> : <PublicApp/>}</React.StrictMode>
);
