export const updateUserSchema = {

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

        telefono: {
            type: "string"
        },

        distrito: {
            type: "string"
        }

    },

    additionalProperties: false

};