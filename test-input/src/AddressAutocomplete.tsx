'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './address-autocomplete.module.css';

interface AddressAutocompleteProps {
  value?: string;
  onAddressSelect: (address: string, details?: NominatimResult) => void;
  placeholder?: string;
  className?: string;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    city_district?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

export default function AddressAutocomplete({
  value = '',
  onAddressSelect,
  placeholder = 'Enter address...',
  className
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  // Helper: extract street and number from user input (e.g. "Okinawa 1518, Ze" -> { street: 'Okinawa', number: '1518' })
  const extractStreetAndNumber = (input: string): { street: string; number: string | null } => {
    const withoutCommas = input.split(',')[0].trim();

    // Split into tokens
    const tokens = withoutCommas.split(/\s+/);

    // Find all numeric tokens (including alphanumeric like "1518A")
    const numericTokenIndices: number[] = [];
    tokens.forEach((token, idx) => {
      if (/^\d+[A-Za-z0-9\-\/]*$/.test(token)) {
        numericTokenIndices.push(idx);
      }
    });

    // Case 1: Two or more numeric tokens -> assume last one is house number, rest are part of street
    if (numericTokenIndices.length >= 2) {
      const houseNumberIdx = numericTokenIndices[numericTokenIndices.length - 1];
      const streetTokens = tokens.slice(0, houseNumberIdx);
      const houseNumber = tokens[houseNumberIdx];

      return {
        street: streetTokens.join(' ').trim(),
        number: houseNumber
      };
    }

    // Case 2: One numeric token -> use old logic (last number is house number)
    if (numericTokenIndices.length === 1) {
      const numIdx = numericTokenIndices[0];
      // If number is at the end, it's a house number
      if (numIdx === tokens.length - 1 && numIdx > 0) {
        return {
          street: tokens.slice(0, numIdx).join(' ').trim(),
          number: tokens[numIdx]
        };
      }
      // If number is at beginning/middle, it's part of street name (e.g., "street 28")
      return {
        street: withoutCommas,
        number: null
      };
    }

    // Case 3: No numeric tokens
    return { street: withoutCommas, number: null };
  };

  // Format address in Argentinian style, optionally injecting a user provided number
  const formatArgentinianAddress = (
    result: NominatimResult,
    injected?: { street: string; number: string | null }
  ): string => {
    const addr = result.address;
    if (!addr) return result.display_name;

    const streetOSM = addr.road || '';
    // Separate locality and municipality
    const locality = addr.town || addr.suburb || addr.village || '';
    const municipality = addr.municipality || addr.city_district || addr.city || '';
    const state = addr.state || '';

    let number = addr.house_number || '';
    let streetToUse = streetOSM;

    // If user typed a number, ALWAYS inject it (even if street names don't match)
    // This is because local names (e.g., "Calle 844") often differ from official names (e.g., "Av. José Andrés López")
    if (injected?.number) {
      number = injected.number;
    }

    // If user provided a street name, use it instead of OSM's official name
    // This preserves local street names that users are familiar with
    if (injected?.street) {
      streetToUse = injected.street;
    }

    // Build pieces ensuring street always followed by number if number exists
    const parts: string[] = [];
    if (streetToUse) {
      parts.push(number ? `${streetToUse} ${number}` : streetToUse);
    }
    if (locality) parts.push(locality);
    if (municipality) parts.push(municipality);
    if (state) parts.push(state);
    // Postal code intentionally omitted

    const formatted = parts.join(', ').trim();
    return formatted || result.display_name;
  };

  // Debounced search function
  const searchAddresses = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const parsed = extractStreetAndNumber(query);

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&countrycodes=ar&q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'OdontoSoft-Address-Search/1.0' } }
      );

      if (response.ok) {
        const results: NominatimResult[] = await response.json();

        // Filter out results that don't have a street/road (they're just generic locations)
        const validResults = results.filter(r => r.address?.road);

        // If no valid streets found, don't show any suggestions
        if (validResults.length === 0) {
          setSuggestions([]);
          setShowSuggestions(false);
          setIsLoading(false);
          return;
        }

        // Map + inject user number if present
        let mapped: NominatimResult[] = validResults.map(r => ({
          ...r,
          display_name: formatArgentinianAddress(r, parsed)
        }));

        // If user typed a number, enforce that suggestions include it
        if (parsed.number) {
          mapped = mapped.filter(s => s.display_name.includes(parsed.number!));

          // If filtering removed all, synthesize suggestions from original results
          if (mapped.length === 0) {
            mapped = validResults.map(r => ({
              ...r,
              display_name: formatArgentinianAddress(r, parsed)
            }));
          }
        }

        // Dedupe by display_name
        const seen = new Set<string>();
        const deduped: NominatimResult[] = [];
        for (const m of mapped) {
          if (!seen.has(m.display_name)) {
            seen.add(m.display_name);
            deduped.push(m);
          }
        }

        setSuggestions(deduped);
        setShowSuggestions(deduped.length > 0);
      } else {
        console.error('Address search failed:', response.status);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Address search error:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle input change with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSelectedIndex(-1);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the search
    debounceRef.current = setTimeout(() => {
      searchAddresses(newValue);
    }, 300);
  };

  // Handle suggestion selection
  const handleSuggestionClick = (suggestion: NominatimResult) => {
    setInputValue(suggestion.display_name);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    onAddressSelect(suggestion.display_name, suggestion);
  };

  // Ensure parent state reflects free-typed value even if user doesn't press Enter or pick a suggestion
  const handleBlur = () => {
    // If input differs from prop value (latest saved) propagate it
    if (inputValue !== value) {
      onAddressSelect(inputValue);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        onAddressSelect(inputValue);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else {
          onAddressSelect(inputValue);
        }
        break;
      case 'Escape':
        setSuggestions([]);
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update input value when prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`${styles.input} ${className || ''}`}
        autoComplete="off"
      />

      {isLoading && (
        <div className={styles.loading}>
          Searching addresses...
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div ref={suggestionsRef} className={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.lat}-${suggestion.lon}`}
              className={`${styles.suggestion} ${index === selectedIndex ? styles.selected : ''}`}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
