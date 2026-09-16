ALTER TABLE channel_connections DROP CONSTRAINT channel_connections_provider_check;
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_provider_check
  CHECK (provider IN ('shopify', 'woocommerce', 'amazon', 'magento', 'opencart', 'custom'));
