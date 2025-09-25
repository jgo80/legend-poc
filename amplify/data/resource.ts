import { a, ClientSchema, defineData } from '@aws-amplify/backend';

export const schema = a.schema({
  Client: a
    .model({
      // Meta
      id: a.id().required(),
      accountId: a.id(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      deleted: a.boolean(),
      // Data
      name: a.string(),
      email: a.string(),
    })
    .secondaryIndexes((index) => [index('accountId').sortKeys(['updatedAt'])])
    .authorization((allow) => [allow.authenticated()]),
  Todo: a
    .model({
      // Meta
      id: a.id().required(),
      accountId: a.id(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      deleted: a.boolean(),
      // Data
      title: a.string().required(),
      completed: a.boolean(),
    })
    .secondaryIndexes((index) => [index('accountId').sortKeys(['updatedAt'])])
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
