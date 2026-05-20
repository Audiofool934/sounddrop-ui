import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Submit() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/map?create=true', { replace: true }); }, [navigate]);
  return null;
}
