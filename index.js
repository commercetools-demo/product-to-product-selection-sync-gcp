const {
  createApiBuilderFromCtpClient,
} = require("@commercetools/platform-sdk");
const { ClientBuilder } = require("@commercetools/sdk-client-v2");
const  dotenv  = require('dotenv');

dotenv.config();

const readConfiguration = () => {
  const envVars = {
    clientId: process.env.CTP_CLIENT_ID,
    clientSecret: process.env.CTP_CLIENT_SECRET,
    projectKey: process.env.CTP_PROJECT_KEY,
    scope: process.env.CTP_SCOPE,
    region: process.env.CTP_REGION,
  };

  return envVars;
};

const httpMiddlewareOptions = {
  host: `https://api.${readConfiguration().region}.commercetools.com`,
};

const authMiddlewareOptions = {
  host: `https://auth.${readConfiguration().region}.commercetools.com`,
  projectKey: readConfiguration().projectKey,
  credentials: {
    clientId: readConfiguration().clientId,
    clientSecret: readConfiguration().clientSecret,
  },
  scopes: [readConfiguration().scope ? readConfiguration().scope : "default"],
};

const createClient = () =>
  new ClientBuilder()
    .withProjectKey(readConfiguration().projectKey)
    .withClientCredentialsFlow(authMiddlewareOptions)
    .withHttpMiddleware(httpMiddlewareOptions)
    .build();

const createApiRoot = ((root) => () => {
  if (root) {
    return root;
  }

  root = createApiBuilderFromCtpClient(createClient()).withProjectKey({
    projectKey: readConfiguration().projectKey,
  });

  return root;
})();

const parseMessage = (data) => {
  const pubSubMessage = data;
  const message = pubSubMessage.data
    ? Buffer.from(pubSubMessage.data, "base64").toString()
    : undefined;
  return message && JSON.parse(message);
};

const getProductAttributes = (message) => {
  return  message?.productProjection?.masterVariant?.attributes;
};

async function getProductSelectionByKey(productSelectionKey) {
  return await createApiRoot()
    .productSelections()
    .withKey({ key: productSelectionKey })
    .get()
    .execute()
    .then((response) => {
      console.info(`Product selection found: ${response.body.key}`);
      return response.body;
    });
}
async function syncProductToProductSelection(productSelection, productId) {
  console.info(
    `Syncing product ${productId} to product selection ${productSelection.id}`
  );
  return await createApiRoot()
    .productSelections()
    .withId({
      ID: productSelection.id,
    })
    .post({
      body: {
        version: productSelection.version,
        actions: [
          {
            action: "addProduct",
            product: {
              typeId: "product",
              id: productId,
            },
          },
        ],
      },
    })
    .execute()
    .then((response) => response.body);
}

exports.productToProductSelectionSync = productToProductSelectionSync = async (
  event,
  context
) => {
  const message = parseMessage(event);
  const productId = message?.resource?.id;
  console.info(`Received productId: ${productId}`);
  const productAttributes = getProductAttributes(message);
  const productSelectionAttribute = productAttributes?.find(
    (attribute) => attribute?.name === "dealer_name"
  );

  if (!productSelectionAttribute) {
    console.info("Product selection attribute not found");
    return;
  }
  console.info(`Product selection attribute: ${productSelectionAttribute.value}`);
  const productSelectionKey = "product_selection_" + productSelectionAttribute.value;
  const productSelection = await getProductSelectionByKey(productSelectionKey);

  await syncProductToProductSelection(productSelection, productId);
};
