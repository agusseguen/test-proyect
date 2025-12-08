import { useState } from 'react';
import AddressAutocomplete from './AddressAutocomplete';
import './App.css';

function App() {
  const [addressSaved, setAddressSaved] = useState<string>('');

  const handleAddressSelect = (address: string, details?: any) => {

    // if details is undefined, it means the user clicked outside the input
    if (!details) {
      console.log("Ignore click outside input");
      return;
    }

    // to avoid duplicates
    if (address === addressSaved) return;

    console.log("Address selected:", address);
    setAddressSaved(address);

    saveFile(address);
  };

  const saveFile = (address: string) => {
    const file = new Blob([`Address: ${address}\nDate: ${new Date().toLocaleString()}`], { type: 'text/plain' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = "address.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', fontFamily: 'Arial' }}>
      <h1>Buscador de direcciones (Argentina)</h1>

      <div style={{ marginTop: '20px' }}>
        <AddressAutocomplete
          value={addressSaved}
          onAddressSelect={handleAddressSelect}
          placeholder="Ej. Av. Alsina 123"
        />
      </div>

      {addressSaved && (
        <p style={{ marginTop: '20px', color: 'green', fontWeight: 'bold' }}>
          Guardado: {addressSaved}
        </p>
      )}
    </div>
  );
}

export default App;