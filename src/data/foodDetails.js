export const foodDetails = {
    icecream: {
        displayName: 'Velvet Sundae',
        price: 5,
        calories: 320,
        deliveryMinutes: 9
    },
    taco: {
        displayName: 'Sunset Taco',
        price: 6,
        calories: 410,
        deliveryMinutes: 11
    },
    donut: {
        displayName: 'Peach Swirl Donut',
        price: 3,
        calories: 285,
        deliveryMinutes: 8
    },
    fries: {
        displayName: 'Glazed Fries',
        price: 4,
        calories: 360,
        deliveryMinutes: 7
    },
    hotdog: {
        displayName: 'Cherry Glow Dog',
        price: 4,
        calories: 450,
        deliveryMinutes: 10
    },
    burger: {
        displayName: 'Aurora Burger',
        price: 8,
        calories: 620,
        deliveryMinutes: 12
    },
    chicken: {
        displayName: 'Honey Drum Bucket',
        price: 9,
        calories: 540,
        deliveryMinutes: 14
    },
    coffee: {
        displayName: 'Caramel Cloud Frappe',
        price: 4,
        calories: 210,
        deliveryMinutes: 6
    },
    pizza: {
        displayName: 'Golden Slice',
        price: 6,
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

