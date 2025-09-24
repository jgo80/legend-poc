import { a, ClientSchema, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Todo: a
    .model({
      id: a.id().required(),
      title: a.string().required(),
      completed: a.boolean(),
    })
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;
export type ModelType = keyof Schema;
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
