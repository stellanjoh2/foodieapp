export const foodDetails = {
    icecream: {
        displayName: 'Velvet Sundae',
        price: 4.75,
        calories: 320,
        deliveryMinutes: 9
    },
    taco: {
        displayName: 'Sunset Taco',
        price: 5.90,
        calories: 410,
        deliveryMinutes: 11
    },
    donut: {
        displayName: 'Peach Swirl Donut',
        price: 3.40,
        calories: 285,
        deliveryMinutes: 8
    },
    fries: {
        displayName: 'Glazed Fries',
        price: 3.85,
        calories: 360,
        deliveryMinutes: 7
    },
    hotdog: {
        displayName: 'Cherry Glow Dog',
        price: 4.30,
        calories: 450,
        deliveryMinutes: 10
    },
    burger: {
        displayName: 'Aurora Burger',
        price: 7.80,
        calories: 620,
        deliveryMinutes: 12
    },
    chicken: {
        displayName: 'Honey Drum Bucket',
        price: 8.60,
        calories: 540,
        deliveryMinutes: 14
    },
    coffee: {
        displayName: 'Caramel Cloud Frappe',
        price: 4.10,
        calories: 210,
        deliveryMinutes: 6
    },
    pizza: {
        displayName: 'Golden Slice',
        price: 6.50,
        calories: 520,
        deliveryMinutes: 13
    }
};

export function getFoodDetailsByName(name) {
    return foodDetails[name] || {
        displayName: name,
        price: 5.0,
        calories: 400,
        deliveryMinutes: 10
    };
}

