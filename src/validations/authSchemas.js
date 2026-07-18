export const registerSchema = {

    type: "object",

    properties: {

        nombre: {
            type: "string",
            minLength: 2
        },

        apellido: {
            type: "string",
            minLength: 2
        },

        email: {
            type: "string",
            format: "email"
        },

        password: {
            type: "string",
            minLength: 8
        },

        telefono: {
            type: "string"
        },

        distrito: {
            type: "string"
        }

    },

    required: [

        "nombre",

        "apellido",

        "email",

        "password"

    ],

    additionalProperties: false

};

export const loginSchema = {

    type: "object",

    properties: {

        email: {
            type: "string",
            format: "email"
        },

        password: {
            type: "string"
        }

    },

    required: [

        "email",

        "password"

    ],

    additionalProperties: false

};