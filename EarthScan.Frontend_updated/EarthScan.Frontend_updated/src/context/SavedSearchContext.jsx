import React, { createContext, useState, useEffect } from 'react';

export const SavedSearchContext = createContext();

export const SavedSearchProvider = ({ children }) => {
    const [savedLocations, setSavedLocations] = useState([]);

    // Load from local storage on mount
    useEffect(() => {
        const stored = localStorage.getItem('savedLocations');
        if (stored) {
            setSavedLocations(JSON.parse(stored));
        }
    }, []);

    const addSavedSearch = (locationData) => {
        setSavedLocations((prev) => {
            const isDuplicate = prev.some(loc => {
                if (locationData.id && loc.id) {
                    return String(loc.id) === String(locationData.id);
                }
                return loc.pin === locationData.pin;
            });
            if (isDuplicate) {
                return prev;
            }
            const newLocations = [...prev, { ...locationData, id: locationData.id || Date.now() }];
            localStorage.setItem('savedLocations', JSON.stringify(newLocations));
            return newLocations;
        });
    };

    const removeSavedSearch = (id) => {
        setSavedLocations((prev) => {
            const newLocations = prev.filter(loc => loc.id !== id);
            localStorage.setItem('savedLocations', JSON.stringify(newLocations));
            return newLocations;
        });
    };

    return (
        <SavedSearchContext.Provider value={{ savedLocations, addSavedSearch, removeSavedSearch }}>
            {children}
        </SavedSearchContext.Provider>
    );
};
