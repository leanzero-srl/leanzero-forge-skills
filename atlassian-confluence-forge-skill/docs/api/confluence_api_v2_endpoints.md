# Confluence Cloud REST API v2 - Specialized Endpoints

This document contains detailed documentation for specialized Confluence Cloud REST API v2 endpoints.

---

## Whiteboards API

### `POST /whiteboards`

**Operation:** `createWhiteboard`

**Summary:** Create whiteboard

**Description:**
Creates a whiteboard in the space.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the corresponding space. Permission to create a whiteboard in the space.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| private | boolean | No | The whiteboard will be private. Only the user who creates this whiteboard will have permission to view and edit one. |

**Request Body:**


**Required OAuth Scopes (Forge):**

- `write:whiteboard:confluence`

**Response Formats:**

- **200:** Returned if the whiteboard was successfully created.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing from the request.
- **413:** Returned if the request is too large in size (over 5 MB).

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the corresponding space. Permission to create a whiteboard in the space.

### `GET /whiteboards/{id}`

**Operation:** `getWhiteboardById`

**Summary:** Get whiteboard by id

**Description:**
Returns a specific whiteboard.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard and its corresponding space.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| include-collaborators | boolean | No | Includes collaborators on the whiteboard. |
| include-direct-children | boolean | No | Includes direct children of the whiteboard, as defined in the `ChildrenResponse` object. |
| include-operations | boolean | No | Includes operations associated with this whiteboard in the response, as defined in the `Operation` object.
The number of results will be limited to 50 and sorted in the default sort order.
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |
| include-properties | boolean | No | Includes content properties associated with this whiteboard in the response.
The number of results will be limited to 50 and sorted in the default sort order.
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the whiteboard to be returned |

**Required OAuth Scopes (Forge):**

- `read:whiteboard:confluence`

**Response Formats:**

- **200:** Returned if the requested whiteboard is returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
requested whiteboard or the whiteboard was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard and its corresponding space.

### `DELETE /whiteboards/{id}`

**Operation:** `deleteWhiteboard`

**Summary:** Delete whiteboard

**Description:**
Delete a whiteboard by id.

Deleting a whiteboard moves the whiteboard to the trash, where it can be restored later

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard and its corresponding space.
Permission to delete whiteboards in the space.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the whiteboard to be deleted. |

**Required OAuth Scopes (Forge):**

- `delete:whiteboard:confluence`

**Response Formats:**

- **204:** Returned if the whiteboard was successfully deleted.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard and its corresponding space.
Permission to delete whiteboards in the space.

### `GET /whiteboards/{id}/properties`

**Operation:** `getWhiteboardContentProperties`

**Summary:** Get content properties for whiteboard

**Description:**
Retrieves Content Properties tied to a specified whiteboard.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | string | No | Filters the response to return a specific content property with matching key (case sensitive). |
| sort | string | No | Used to sort the result by a particular field. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of attachments per result to return. If more results exist, use the `Link` header to retrieve a relative URL that will return the next set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the whiteboard for which content properties should be returned. |

**Required OAuth Scopes (Forge):**

- `read:whiteboard:confluence`

**Response Formats:**

- **200:** Returned if the requested content properties are successfully retrieved.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified whiteboard or the whiteboard was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard.

### `POST /whiteboards/{id}/properties`

**Operation:** `createWhiteboardProperty`

**Summary:** Create content property for whiteboard

**Description:**
Creates a new content property for a whiteboard.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to update the whiteboard.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the whiteboard to create a property for. |

**Request Body:**

*Schema: `#/components/schemas/ContentPropertyCreateRequest`*

**Required OAuth Scopes (Forge):**

- `read:whiteboard:confluence`
- `write:whiteboard:confluence`

**Response Formats:**

- **200:** Returned if the content property was created successfully. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified whiteboard or the whiteboard was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to update the whiteboard.

### `GET /whiteboards/{whiteboard-id}/properties/{property-id}`

**Operation:** `getWhiteboardContentPropertiesById`

**Summary:** Get content property for whiteboard by id

**Description:**
Retrieves a specific Content Property by ID that is attached to a specified whiteboard.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| whiteboard-id | integer | Yes | The ID of the whiteboard for which content properties should be returned. |
| property-id | integer | Yes | The ID of the content property being requested. |

**Required OAuth Scopes (Forge):**

- `read:whiteboard:confluence`

**Response Formats:**

- **200:** Returned if the requested content property is successfully retrieved. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified whiteboard, the whiteboard was not found, or the property was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard.

### `PUT /whiteboards/{whiteboard-id}/properties/{property-id}`

**Operation:** `updateWhiteboardPropertyById`

**Summary:** Update content property for whiteboard by id

**Description:**
Update a content property for a whiteboard by its id. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the whiteboard.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| whiteboard-id | integer | Yes | The ID of the whiteboard the property belongs to. |
| property-id | integer | Yes | The ID of the property to be updated. |

**Request Body:**

*Schema: `#/components/schemas/ContentPropertyUpdateRequest`*

**Required OAuth Scopes (Forge):**

- `read:whiteboard:confluence`
- `write:whiteboard:confluence`

**Response Formats:**

- **200:** Returned if the content property was updated successfully. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified whiteboard or the whiteboard was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the whiteboard.

### `DELETE /whiteboards/{whiteboard-id}/properties/{property-id}`

**Operation:** `deleteWhiteboardPropertyById`

**Summary:** Delete content property for whiteboard by id

**Description:**
Deletes a content property for a whiteboard by its id. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the whiteboard.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| whiteboard-id | integer | Yes | The ID of the whiteboard the property belongs to. |
| property-id | integer | Yes | The ID of the property to be deleted. |

**Required OAuth Scopes (Forge):**

- `read:whiteboard:confluence`
- `write:whiteboard:confluence`

**Response Formats:**

- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified whiteboard or the whiteboard was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the whiteboard.

### `GET /whiteboards/{id}/operations`

**Operation:** `getWhiteboardOperations`

**Summary:** Get permitted operations for a whiteboard

**Description:**
Returns the permitted operations on specific whiteboard.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard and its corresponding space.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the whiteboard for which operations should be returned. |

**Required OAuth Scopes (Forge):**

- `read:whiteboard:confluence`

**Response Formats:**

- **200:** Returned if the requested operations are returned. (see `#/components/schemas/PermittedOperationsResponse`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
requested whiteboard or the whiteboard was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the whiteboard and its corresponding space.

### `GET /whiteboards/{id}/direct-children`

**Operation:** `getWhiteboardDirectChildren`

**Summary:** Get direct children of a whiteboard

**Description:**
Returns all children for given whiteboard id in the content tree. The number of results is limited by the `limit` parameter and additional results (if available)
will be available through the `next` URL present in the `Link` response header.

The following types of content will be returned:
- Database
- Embed
- Folder
- Page
- Whiteboard

This endpoint returns minimal information about each child. To fetch more details, use a related endpoint based on the content type, such
as:

- [Get database by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-database/#api-databases-id-get)
- [Get embed by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-smart-link/#api-embeds-id-get)
- [Get folder by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-folder/#api-folders-id-get)
- [Get page by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get)
- [Get whiteboard by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-whiteboard/#api-whiteboards-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Only content that the user has permission to view will be returned.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of items per result to return. If more results exist, use the `Link` header to retrieve a relative URL that will return the next set of results. |
| sort | string | No | Used to sort the result by a particular field. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the parent whiteboard. |

**Required OAuth Scopes (Forge):**

- `read:hierarchical-content:confluence`

**Response Formats:**

- **200:** Returned if the requested children are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Only content that the user has permission to view will be returned.

### `GET /whiteboards/{id}/descendants`

**Operation:** `getWhiteboardDescendants`

**Summary:** Get descendants of a whiteboard

**Description:**
Returns descendants in the content tree for a given whiteboard by ID in top-to-bottom order (that is, the highest descendant is the first
item in the response payload). The number of results is limited by the `limit` parameter and additional results (if available)
will be available by calling this endpoint with the cursor in the response payload. There is also a `depth` parameter specifying depth
of descendants to be fetched.

The following types of content will be returned:
- Database
- Embed
- Folder
- Page
- Whiteboard

This endpoint returns minimal information about each descendant. To fetch more details, use a related endpoint based on the content type, such
as:

- [Get database by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-database/#api-databases-id-get)
- [Get embed by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-smart-link/#api-embeds-id-get)
- [Get folder by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-folder/#api-folders-id-get)
- [Get page by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get)
- [Get whiteboard by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-whiteboard/#api-whiteboards-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the whiteboard and its corresponding space

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | integer | No | Maximum number of items per result to return. If more results exist, call the endpoint with the cursor to fetch the next set of results. |
| depth | integer | No | Maximum depth of descendants to return. If more results are required, use the endpoint corresponding to the content type of the deepest descendant to fetch more descendants. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the whiteboard. |

**Required OAuth Scopes (Forge):**

- `read:hierarchical-content:confluence`

**Response Formats:**

- **200:** Returned if the requested descendants are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the whiteboard and its corresponding space

### `GET /whiteboards/{id}/ancestors`

**Operation:** `getWhiteboardAncestors`

**Summary:** Get all ancestors of whiteboard

**Description:**
Returns all ancestors for a given whiteboard by ID in top-to-bottom order (that is, the highest ancestor is the first
item in the response payload). The number of results is limited by the `limit` parameter and additional results (if available)
will be available by calling this endpoint with the ID of first ancestor in the response payload.

This endpoint returns minimal information about each ancestor. To fetch more details, use a related endpoint, such
as [Get whiteboard by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-whiteboard/#api-whiteboards-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the whiteboard and its corresponding space

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | integer | No | Maximum number of items per result to return. If more results exist, call the endpoint with the highest ancestor's ID to fetch the next set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the whiteboard. |

**Required OAuth Scopes (Forge):**

- `read:content.metadata:confluence`

**Response Formats:**

- **200:** Returned if the requested ancestors are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the whiteboard and its corresponding space

---

## Database API

### `POST /databases`

**Operation:** `createDatabase`

**Summary:** Create database

**Description:**
Creates a database in the space.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the corresponding space. Permission to create a database in the space.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| private | boolean | No | The database will be private. Only the user who creates this database will have permission to view and edit one. |

**Request Body:**


**Required OAuth Scopes (Forge):**

- `write:database:confluence`

**Response Formats:**

- **200:** Returned if the database was successfully created.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing from the request.
- **413:** Returned if the request is too large in size (over 5 MB).

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the corresponding space. Permission to create a database in the space.

### `GET /databases/{id}`

**Operation:** `getDatabaseById`

**Summary:** Get database by id

**Description:**
Returns a specific database.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database and its corresponding space.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| include-collaborators | boolean | No | Includes collaborators on the database. |
| include-direct-children | boolean | No | Includes direct children of the database, as defined in the `ChildrenResponse` object. |
| include-operations | boolean | No | Includes operations associated with this database in the response, as defined in the `Operation` object.
The number of results will be limited to 50 and sorted in the default sort order.
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |
| include-properties | boolean | No | Includes content properties associated with this database in the response.
The number of results will be limited to 50 and sorted in the default sort order.
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the database to be returned |

**Required OAuth Scopes (Forge):**

- `read:database:confluence`

**Response Formats:**

- **200:** Returned if the requested database is returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
requested database or the database was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database and its corresponding space.

### `DELETE /databases/{id}`

**Operation:** `deleteDatabase`

**Summary:** Delete database

**Description:**
Delete a database by id.

Deleting a database moves the database to the trash, where it can be restored later

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database and its corresponding space.
Permission to delete databases in the space.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the database to be deleted. |

**Required OAuth Scopes (Forge):**

- `delete:database:confluence`

**Response Formats:**

- **204:** Returned if the database was successfully deleted.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database and its corresponding space.
Permission to delete databases in the space.

### `GET /databases/{id}/properties`

**Operation:** `getDatabaseContentProperties`

**Summary:** Get content properties for database

**Description:**
Retrieves Content Properties tied to a specified database.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | string | No | Filters the response to return a specific content property with matching key (case sensitive). |
| sort | string | No | Used to sort the result by a particular field. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of attachments per result to return. If more results exist, use the `Link` header to retrieve a relative URL that will return the next set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the database for which content properties should be returned. |

**Required OAuth Scopes (Forge):**

- `read:database:confluence`

**Response Formats:**

- **200:** Returned if the requested content properties are successfully retrieved.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified database or the database was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database.

### `POST /databases/{id}/properties`

**Operation:** `createDatabaseProperty`

**Summary:** Create content property for database

**Description:**
Creates a new content property for a database.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to update the database.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the database to create a property for. |

**Request Body:**

*Schema: `#/components/schemas/ContentPropertyCreateRequest`*

**Required OAuth Scopes (Forge):**

- `read:database:confluence`
- `write:database:confluence`

**Response Formats:**

- **200:** Returned if the content property was created successfully. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified database or the database was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to update the database.

### `GET /databases/{database-id}/properties/{property-id}`

**Operation:** `getDatabaseContentPropertiesById`

**Summary:** Get content property for database by id

**Description:**
Retrieves a specific Content Property by ID that is attached to a specified database.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| database-id | integer | Yes | The ID of the database for which content properties should be returned. |
| property-id | integer | Yes | The ID of the content property being requested. |

**Required OAuth Scopes (Forge):**

- `read:database:confluence`

**Response Formats:**

- **200:** Returned if the requested content property is successfully retrieved. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified database, the database was not found, or the property was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database.

### `PUT /databases/{database-id}/properties/{property-id}`

**Operation:** `updateDatabasePropertyById`

**Summary:** Update content property for database by id

**Description:**
Update a content property for a database by its id. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the database.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| database-id | integer | Yes | The ID of the database the property belongs to. |
| property-id | integer | Yes | The ID of the property to be updated. |

**Request Body:**

*Schema: `#/components/schemas/ContentPropertyUpdateRequest`*

**Required OAuth Scopes (Forge):**

- `read:database:confluence`
- `write:database:confluence`

**Response Formats:**

- **200:** Returned if the content property was updated successfully. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified database or the database was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the database.

### `DELETE /databases/{database-id}/properties/{property-id}`

**Operation:** `deleteDatabasePropertyById`

**Summary:** Delete content property for database by id

**Description:**
Deletes a content property for a database by its id. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the database.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| database-id | integer | Yes | The ID of the database the property belongs to. |
| property-id | integer | Yes | The ID of the property to be deleted. |

**Required OAuth Scopes (Forge):**

- `read:database:confluence`
- `write:database:confluence`

**Response Formats:**

- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified database or the database was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the database.

### `GET /databases/{id}/operations`

**Operation:** `getDatabaseOperations`

**Summary:** Get permitted operations for a database

**Description:**
Returns the permitted operations on specific database.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database and its corresponding space.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the database for which operations should be returned. |

**Required OAuth Scopes (Forge):**

- `read:database:confluence`

**Response Formats:**

- **200:** Returned if the requested operations are returned. (see `#/components/schemas/PermittedOperationsResponse`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
requested database or the database was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the database and its corresponding space.

### `GET /databases/{id}/direct-children`

**Operation:** `getDatabaseDirectChildren`

**Summary:** Get direct children of a database

**Description:**
Returns all children for given database id in the content tree. The number of results is limited by the `limit` parameter and additional results (if available)
will be available through the `next` URL present in the `Link` response header.

The following types of content will be returned:
- Database
- Embed
- Folder
- Page
- Whiteboard

This endpoint returns minimal information about each child. To fetch more details, use a related endpoint based on the content type, such
as:

- [Get database by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-database/#api-databases-id-get)
- [Get embed by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-smart-link/#api-embeds-id-get)
- [Get folder by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-folder/#api-folders-id-get)
- [Get page by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get)
- [Get whiteboard by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-whiteboard/#api-whiteboards-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Only content that the user has permission to view will be returned.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of items per result to return. If more results exist, use the `Link` header to retrieve a relative URL that will return the next set of results. |
| sort | string | No | Used to sort the result by a particular field. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the parent database. |

**Required OAuth Scopes (Forge):**

- `read:hierarchical-content:confluence`

**Response Formats:**

- **200:** Returned if the requested children are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified database or the database was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Only content that the user has permission to view will be returned.

### `GET /databases/{id}/descendants`

**Operation:** `getDatabaseDescendants`

**Summary:** Get descendants of a database

**Description:**
Returns descendants in the content tree for a given database by ID in top-to-bottom order (that is, the highest descendant is the first
item in the response payload). The number of results is limited by the `limit` parameter and additional results (if available)
will be available by calling this endpoint with the cursor in the response payload. There is also a `depth` parameter specifying depth
of descendants to be fetched.

The following types of content will be returned:
- Database
- Embed
- Folder
- Page
- Whiteboard

This endpoint returns minimal information about each descendant. To fetch more details, use a related endpoint based on the content type, such
as:

- [Get database by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-database/#api-databases-id-get)
- [Get embed by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-smart-link/#api-embeds-id-get)
- [Get folder by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-folder/#api-folders-id-get)
- [Get page by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get)
- [Get whiteboard by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-whiteboard/#api-whiteboards-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the database and its corresponding space

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | integer | No | Maximum number of items per result to return. If more results exist, call the endpoint with the cursor to fetch the next set of results. |
| depth | integer | No | Maximum depth of descendants to return. If more results are required, use the endpoint corresponding to the content type of the deepest descendant to fetch more descendants. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the database. |

**Required OAuth Scopes (Forge):**

- `read:hierarchical-content:confluence`

**Response Formats:**

- **200:** Returned if the requested descendants are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified database or the database was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the database and its corresponding space

### `GET /databases/{id}/ancestors`

**Operation:** `getDatabaseAncestors`

**Summary:** Get all ancestors of database

**Description:**
Returns all ancestors for a given database by ID in top-to-bottom order (that is, the highest ancestor is the first
item in the response payload). The number of results is limited by the `limit` parameter and additional results (if available)
will be available by calling this endpoint with the ID of first ancestor in the response payload.

This endpoint returns minimal information about each ancestor. To fetch more details, use a related endpoint, such
as [Get database by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-database/#api-databases-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the database and its corresponding space

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | integer | No | Maximum number of items per result to return. If more results exist, call the endpoint with the highest ancestor's ID to fetch the next set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the database. |

**Required OAuth Scopes (Forge):**

- `read:content.metadata:confluence`

**Response Formats:**

- **200:** Returned if the requested ancestors are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the database and its corresponding space

---

## Smart Links/Embeds API

### `POST /embeds`

**Operation:** `createSmartLink`

**Summary:** Create Smart Link in the content tree

**Description:**
Creates a Smart Link in the content tree in the space.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the corresponding space. Permission to create a Smart Link in the content tree in the space.

**Request Body:**


**Required OAuth Scopes (Forge):**

- `write:embed:confluence`

**Response Formats:**

- **200:** Returned if the Smart Link was successfully created in the content tree.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing from the request.
- **413:** Returned if the request is too large in size (over 5 MB).

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the corresponding space. Permission to create a Smart Link in the content tree in the space.

### `GET /embeds/{id}`

**Operation:** `getSmartLinkById`

**Summary:** Get Smart Link in the content tree by id

**Description:**
Returns a specific Smart Link in the content tree.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree and its corresponding space.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| include-collaborators | boolean | No | Includes collaborators on the Smart Link. |
| include-direct-children | boolean | No | Includes direct children of the Smart Link, as defined in the `ChildrenResponse` object. |
| include-operations | boolean | No | Includes operations associated with this Smart Link in the response, as defined in the `Operation` object.
The number of results will be limited to 50 and sorted in the default sort order.
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |
| include-properties | boolean | No | Includes content properties associated with this Smart Link in the response.
The number of results will be limited to 50 and sorted in the default sort order.
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the Smart Link in the content tree to be returned. |

**Required OAuth Scopes (Forge):**

- `read:embed:confluence`

**Response Formats:**

- **200:** Returned if the requested Smart Link in the content tree is returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
requested Smart Link in the content tree or the Smart Link was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree and its corresponding space.

### `DELETE /embeds/{id}`

**Operation:** `deleteSmartLink`

**Summary:** Delete Smart Link in the content tree

**Description:**
Delete a Smart Link in the content tree by id.

Deleting a Smart Link in the content tree moves the Smart Link to the trash, where it can be restored later

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree and its corresponding space.
Permission to delete Smart Links in the content tree in the space.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the Smart Link in the content tree to be deleted. |

**Required OAuth Scopes (Forge):**

- `delete:embed:confluence`

**Response Formats:**

- **204:** Returned if the Smart Link in the content tree was successfully deleted.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree and its corresponding space.
Permission to delete Smart Links in the content tree in the space.

### `GET /embeds/{id}/properties`

**Operation:** `getSmartLinkContentProperties`

**Summary:** Get content properties for Smart Link in the content tree

**Description:**
Retrieves Content Properties tied to a specified Smart Link in the content tree.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | string | No | Filters the response to return a specific content property with matching key (case sensitive). |
| sort | string | No | Used to sort the result by a particular field. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of Smart Links per result to return. If more results exist, use the `Link` header to retrieve a relative URL that will return the next set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the Smart Link in the content tree for which content properties should be returned. |

**Required OAuth Scopes (Forge):**

- `read:embed:confluence`

**Response Formats:**

- **200:** Returned if the requested content properties are successfully retrieved.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified Smart Link in the content tree or the Smart Link was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree.

### `POST /embeds/{id}/properties`

**Operation:** `createSmartLinkProperty`

**Summary:** Create content property for Smart Link in the content tree

**Description:**
Creates a new content property for a Smart Link in the content tree.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to update the Smart Link in the content tree.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the Smart Link in the content tree to create a property for. |

**Request Body:**

*Schema: `#/components/schemas/ContentPropertyCreateRequest`*

**Required OAuth Scopes (Forge):**

- `read:embed:confluence`
- `write:embed:confluence`

**Response Formats:**

- **200:** Returned if the content property was created successfully. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified Smart Link in the content tree or the Smart Link was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to update the Smart Link in the content tree.

### `GET /embeds/{embed-id}/properties/{property-id}`

**Operation:** `getSmartLinkContentPropertiesById`

**Summary:** Get content property for Smart Link in the content tree by id

**Description:**
Retrieves a specific Content Property by ID that is attached to a specified Smart Link in the content tree.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| embed-id | integer | Yes | The ID of the Smart Link in the content tree for which content properties should be returned. |
| property-id | integer | Yes | The ID of the content property being requested. |

**Required OAuth Scopes (Forge):**

- `read:embed:confluence`

**Response Formats:**

- **200:** Returned if the requested content property is successfully retrieved. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified Smart Link in the content tree, the Smart Link was not found, or the property was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree.

### `PUT /embeds/{embed-id}/properties/{property-id}`

**Operation:** `updateSmartLinkPropertyById`

**Summary:** Update content property for Smart Link in the content tree by id

**Description:**
Update a content property for a Smart Link in the content tree by its id. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the Smart Link in the content tree.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| embed-id | integer | Yes | The ID of the Smart Link in the content tree the property belongs to. |
| property-id | integer | Yes | The ID of the property to be updated. |

**Request Body:**

*Schema: `#/components/schemas/ContentPropertyUpdateRequest`*

**Required OAuth Scopes (Forge):**

- `read:embed:confluence`
- `write:embed:confluence`

**Response Formats:**

- **200:** Returned if the content property was updated successfully. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified Smart Link in the content tree or the Smart Link was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the Smart Link in the content tree.

### `DELETE /embeds/{embed-id}/properties/{property-id}`

**Operation:** `deleteSmartLinkPropertyById`

**Summary:** Delete content property for Smart Link in the content tree by id

**Description:**
Deletes a content property for a Smart Link in the content tree by its id. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the Smart Link in the content tree.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| embed-id | integer | Yes | The ID of the Smart Link in the content tree the property belongs to. |
| property-id | integer | Yes | The ID of the property to be deleted. |

**Required OAuth Scopes (Forge):**

- `read:embed:confluence`
- `write:embed:confluence`

**Response Formats:**

- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified Smart Link in the content tree or the Smart Link was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the Smart Link in the content tree.

### `GET /embeds/{id}/operations`

**Operation:** `getSmartLinkOperations`

**Summary:** Get permitted operations for a Smart Link in the content tree

**Description:**
Returns the permitted operations on specific Smart Link in the content tree.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree and its corresponding space.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the Smart Link in the content tree for which operations should be returned. |

**Required OAuth Scopes (Forge):**

- `read:embed:confluence`

**Response Formats:**

- **200:** Returned if the requested operations are returned. (see `#/components/schemas/PermittedOperationsResponse`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
requested Smart Link in the content tree or the Smart Link was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the Smart Link in the content tree and its corresponding space.

### `GET /embeds/{id}/direct-children`

**Operation:** `getSmartLinkDirectChildren`

**Summary:** Get direct children of a Smart Link

**Description:**
Returns all children for given smart link id in the content tree. The number of results is limited by the `limit` parameter and additional results (if available)
will be available through the `next` URL present in the `Link` response header.

The following types of content will be returned:
- Database
- Embed
- Folder
- Page
- Whiteboard

This endpoint returns minimal information about each child. To fetch more details, use a related endpoint based on the content type, such
as:

- [Get database by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-database/#api-databases-id-get)
- [Get embed by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-smart-link/#api-embeds-id-get)
- [Get folder by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-folder/#api-folders-id-get)
- [Get page by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get)
- [Get whiteboard by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-whiteboard/#api-whiteboards-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Only content that the user has permission to view will be returned.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of items per result to return. If more results exist, use the `Link` header to retrieve a relative URL that will return the next set of results. |
| sort | string | No | Used to sort the result by a particular field. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the parent smart link. |

**Required OAuth Scopes (Forge):**

- `read:hierarchical-content:confluence`

**Response Formats:**

- **200:** Returned if the requested children are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified smart link or the smart link was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Only content that the user has permission to view will be returned.

### `GET /embeds/{id}/descendants`

**Operation:** `getSmartLinkDescendants`

**Summary:** Get descendants of a smart link

**Description:**
Returns descendants in the content tree for a given smart link by ID in top-to-bottom order (that is, the highest descendant is the first
item in the response payload). The number of results is limited by the `limit` parameter and additional results (if available)
will be available by calling this endpoint with the cursor in the response payload. There is also a `depth` parameter specifying depth
of descendants to be fetched.

The following types of content will be returned:
- Database
- Embed
- Folder
- Page
- Whiteboard


This endpoint returns minimal information about each descendant. To fetch more details, use a related endpoint based on the content type, such
as:

- [Get database by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-database/#api-databases-id-get)
- [Get embed by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-smart-link/#api-embeds-id-get)
- [Get folder by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-folder/#api-folders-id-get)
- [Get page by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/#api-pages-id-get)
- [Get whiteboard by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-whiteboard/#api-whiteboards-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the smart link and its corresponding space

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | integer | No | Maximum number of items per result to return. If more results exist, call the endpoint with the cursor to fetch the next set of results. |
| depth | integer | No | Maximum depth of descendants to return. If more results are required, use the endpoint corresponding to the content type of the deepest descendant to fetch more descendants. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the smart link. |

**Required OAuth Scopes (Forge):**

- `read:hierarchical-content:confluence`

**Response Formats:**

- **200:** Returned if the requested descendants are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified smart link or the smart link was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the smart link and its corresponding space

### `GET /embeds/{id}/ancestors`

**Operation:** `getSmartLinkAncestors`

**Summary:** Get all ancestors of Smart Link in content tree

**Description:**
Returns all ancestors for a given Smart Link in the content tree by ID in top-to-bottom order (that is, the highest ancestor is
the first item in the response payload). The number of results is limited by the `limit` parameter and additional results 
(if available) will be available by calling this endpoint with the ID of first ancestor in the response payload.

This endpoint returns minimal information about each ancestor. To fetch more details, use a related endpoint, such
as [Get Smart Link in the content tree by id](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-smart-link/#api-embeds-id-get).

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the Smart Link in the content tree and its corresponding space

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | integer | No | Maximum number of items per result to return. If more results exist, call the endpoint with the highest ancestor's ID to fetch the next set of results. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the Smart Link in the content tree. |

**Required OAuth Scopes (Forge):**

- `read:content.metadata:confluence`

**Response Formats:**

- **200:** Returned if the requested ancestors are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to access the Confluence site ('Can use' global permission).
Permission to view the Smart Link in the content tree and its corresponding space

---

## Custom Content API

### `GET /custom-content`

**Operation:** `getCustomContentByType`

**Summary:** Get custom content by type

**Description:**
Returns all custom content for a given type. The number of results is limited by the `limit` parameter and additional results (if available)
will be available through the `next` URL present in the `Link` response header.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the custom content, the container of the custom content, and the corresponding space (if different from the container).

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| type | string | Yes | The type of custom content being requested. See: https://developer.atlassian.com/cloud/confluence/custom-content/ for additional details on custom content. |
| id | array | No | Filter the results based on custom content ids. Multiple custom content ids can be specified as a comma-separated list. |
| space-id | array | No | Filter the results based on space ids. Multiple space ids can be specified as a comma-separated list. |
| sort | string | No | Used to sort the result by a particular field. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of pages per result to return. If more results exist, use the `Link` header to retrieve a relative URL that will return the next set of results. |
| body-format | string | No | The content format types to be returned in the `body` field of the response. If available, the representation will be available under a response field of the same name under the `body` field.

Note: If the custom content body type is `storage`, the `storage` and `atlas_doc_format` body formats are able to be returned. If the custom content body type is `raw`, only the `raw` body format is able to be returned. |

**Required OAuth Scopes (Forge):**

- `read:custom-content:confluence`

**Response Formats:**

- **200:** Returned if the requested custom content is returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the custom content, the container of the custom content, and the corresponding space (if different from the container).

### `POST /custom-content`

**Operation:** `createCustomContent`

**Summary:** Create custom content

**Description:**
Creates a new custom content in the given space, page, blogpost or other custom content.

Only one of `spaceId`, `pageId`, `blogPostId`, or `customContentId` is required in the request body.
**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the content of the page or blogpost and its corresponding space. Permission to create custom content in the space.

**Request Body:**


**Required OAuth Scopes (Forge):**

- `write:custom-content:confluence`

**Response Formats:**

- **201:** Returned if the requested custom content is created successfully.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the content of the page or blogpost and its corresponding space. Permission to create custom content in the space.

### `GET /custom-content/{id}`

**Operation:** `getCustomContentById`

**Summary:** Get custom content by id

**Description:**
Returns a specific piece of custom content. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the custom content, the container of the custom content, and the corresponding space (if different from the container).

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| body-format | string | No | The content format types to be returned in the `body` field of the response. If available, the representation will be available under a response field of the same name under the `body` field.

Note: If the custom content body type is `storage`, the `storage` and `atlas_doc_format` body formats are able to be returned. If the custom content body type is `raw`, only the `raw` body format is able to be returned. |
| version | integer | No | Allows you to retrieve a previously published version. Specify the previous version's number to retrieve its details. |
| include-labels | boolean | No | Includes labels associated with this custom content in the response.
The number of results will be limited to 50 and sorted in the default sort order. 
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |
| include-properties | boolean | No | Includes content properties associated with this custom content in the response.
The number of results will be limited to 50 and sorted in the default sort order. 
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |
| include-operations | boolean | No | Includes operations associated with this custom content in the response, as defined in the `Operation` object.
The number of results will be limited to 50 and sorted in the default sort order. 
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |
| include-versions | boolean | No | Includes versions associated with this custom content in the response.
The number of results will be limited to 50 and sorted in the default sort order. 
A `meta` and `_links` property will be present to indicate if more results are available and a link to retrieve the rest of the results. |
| include-version | boolean | No | Includes the current version associated with this custom content in the response.
By default this is included and can be omitted by setting the value to `false`. |
| include-collaborators | boolean | No | Includes collaborators on the custom content. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the custom content to be returned. If you don't know the custom content ID, use Get Custom Content by Type and filter the results. |

**Required OAuth Scopes (Forge):**

- `read:custom-content:confluence`

**Response Formats:**

- **200:** Returned if the requested custom content is returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
requested custom content or the custom content was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the custom content, the container of the custom content, and the corresponding space (if different from the container).

### `PUT /custom-content/{id}`

**Operation:** `updateCustomContent`

**Summary:** Update custom content

**Description:**
Update a custom content by id.
At most one of `spaceId`, `pageId`, `blogPostId`, or `customContentId` is allowed in the request body.
Note that if `spaceId` is specified, it must be the same as the `spaceId` used for creating the custom content
as moving custom content to a different space is not supported.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the content of the page or blogpost and its corresponding space. Permission to update custom content in the space.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the custom content to be updated. If you don't know the custom content ID, use Get Custom Content by Type and filter the results. |

**Request Body:**


**Required OAuth Scopes (Forge):**

- `write:custom-content:confluence`

**Response Formats:**

- **200:** Returned if the requested custom content is updated successfully.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the content of the page or blogpost and its corresponding space. Permission to update custom content in the space.

### `DELETE /custom-content/{id}`

**Operation:** `deleteCustomContent`

**Summary:** Delete custom content

**Description:**
Delete a custom content by id.

Deleting a custom content will either move it to the trash or permanently delete it (purge it), depending on the apiSupport.
To permanently delete a **trashed** custom content, the endpoint must be called with the following param `purge=true`.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the content of the page or blogpost and its corresponding space.
Permission to delete custom content in the space.
Permission to administer the space (if attempting to purge).

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| purge | boolean | No | If attempting to purge the custom content. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | The ID of the custom content to be deleted. |

**Required OAuth Scopes (Forge):**

- `delete:custom-content:confluence`

**Response Formats:**

- **204:** Returned if the custom content was deleted.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the content of the page or blogpost and its corresponding space.
Permission to delete custom content in the space.
Permission to administer the space (if attempting to purge).

### `/custom-content/{id}/properties`

*No documentation found for this endpoint.*

### `GET /custom-content/{custom-content-id}/properties/{property-id}`

**Operation:** `getCustomContentContentPropertiesById`

**Summary:** Get content property for custom content by id

**Description:**
Retrieves a specific Content Property by ID that is attached to a specified custom content.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the page.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| custom-content-id | integer | Yes | The ID of the custom content for which content properties should be returned. |
| property-id | integer | Yes | The ID of the content property being requested. |

**Required OAuth Scopes (Forge):**

- `read:custom-content:confluence`

**Response Formats:**

- **200:** Returned if the requested content property is successfully retrieved. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified custom content, the custom content was not found, or the property was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the page.

### `PUT /custom-content/{custom-content-id}/properties/{property-id}`

**Operation:** `updateCustomContentPropertyById`

**Summary:** Update content property for custom content by id

**Description:**
Update a content property for a piece of custom content by its id. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the custom content.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| custom-content-id | integer | Yes | The ID of the custom content the property belongs to. |
| property-id | integer | Yes | The ID of the property to be updated. |

**Request Body:**

*Schema: `#/components/schemas/ContentPropertyUpdateRequest`*

**Required OAuth Scopes (Forge):**

- `read:custom-content:confluence`
- `write:custom-content:confluence`

**Response Formats:**

- **200:** Returned if the content property was updated successfully. (see `#/components/schemas/ContentProperty`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified custom content or the custom content was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the custom content.

### `DELETE /custom-content/{custom-content-id}/properties/{property-id}`

**Operation:** `deleteCustomContentPropertyById`

**Summary:** Delete content property for custom content by id

**Description:**
Deletes a content property for a piece of custom content by its id. 

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the custom content.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| custom-content-id | integer | Yes | The ID of the custom content the property belongs to. |
| property-id | integer | Yes | The ID of the property to be deleted. |

**Required OAuth Scopes (Forge):**

- `read:custom-content:confluence`
- `write:custom-content:confluence`

**Response Formats:**

- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified custom content or the custom content was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to edit the custom content.

### `GET /custom-content/{custom-content-id}/versions`

**Operation:** `getCustomContentVersions`

**Summary:** Get custom content versions

**Description:**
Returns the versions of specific custom content.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the custom content and its corresponding page and space.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| body-format | string | No | The content format types to be returned in the `body` field of the response. If available, the representation will be available under a response field of the same name under the `body` field.

Note: If the custom content body type is `storage`, the `storage` and `atlas_doc_format` body formats are able to be returned. If the custom content body type is `raw`, only the `raw` body format is able to be returned. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of versions per result to return. If more results exist, use the `Link` header to retrieve a relative URL that will return the next set of results. |
| sort | string | No | Used to sort the result by a particular field. |

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| custom-content-id | integer | Yes | The ID of the custom content to be queried for its versions. If you don't know the custom content ID, use Get custom-content by type and filter the results. |

**Required OAuth Scopes (Forge):**

- `read:custom-content:confluence`

**Response Formats:**

- **200:** Returned if the requested custom content versions are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
requested custom content or the custom content was not found.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the custom content and its corresponding page and space.

### `GET /custom-content/{custom-content-id}/versions/{version-number}`

**Operation:** `getCustomContentVersionDetails`

**Summary:** Get version details for custom content version

**Description:**
Retrieves version details for the specified custom content and version number.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the page.

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| custom-content-id | integer | Yes | The ID of the custom content for which version details should be returned. |
| version-number | integer | Yes | The version number of the custom content to be returned. |

**Required OAuth Scopes (Forge):**

- `read:custom-content:confluence`

**Response Formats:**

- **200:** Returned if the requested version details are successfully retrieved. (see `#/components/schemas/DetailedVersion`)
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.
- **404:** Returned if the calling user does not have permission to view the
specified custom content, the custom content was not found, or the version number does not exist.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Permission to view the page.

---

## Classifications API

### `GET /classification-levels`

**Operation:** `getClassificationLevels`

**Summary:** Get list of classification levels

**Description:**
Returns a list of [classification levels](https://developer.atlassian.com/cloud/admin/dlp/rest/intro/#Classification%20level) 
available.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
'Permission to access the Confluence site ('Can use' global permission).

**Required OAuth Scopes (Forge):**

- `read:configuration:confluence`

**Response Formats:**

- **200:** Returned if classifications levels are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
'Permission to access the Confluence site ('Can use' global permission).

---

## Data Policies API

### `GET /data-policies/metadata`

**Operation:** `getDataPolicyMetadata`

**Summary:** Get data policy metadata for the workspace

**Description:**
Returns data policy metadata for the workspace.

**[Permissions](#permissions) required:**
Only apps can make this request.
Permission to access the Confluence site ('Can use' global permission).

**Required OAuth Scopes (Forge):**

- `read:configuration:confluence`

**Response Formats:**

- **200:** Returned if the request is successful. (see `#/components/schemas/DataPolicyMetadata`)

**Permission Requirements:**

**[Permissions](#permissions) required:**
Only apps can make this request.
Permission to access the Confluence site ('Can use' global permission).

### `GET /data-policies/spaces`

**Operation:** `getDataPolicySpaces`

**Summary:** Get spaces with data policies

**Description:**
Returns all spaces. The results will be sorted by id ascending. The number of results is limited by the `limit` parameter and
additional results (if available) will be available through the `next` URL present in the `Link` response header.

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Only apps can make this request.
Permission to access the Confluence site ('Can use' global permission).
Only spaces that the app has permission to view will be returned.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ids | array | No | Filter the results to spaces based on their IDs. Multiple IDs can be specified as a comma-separated list. |
| keys | array | No | Filter the results to spaces based on their keys. Multiple keys can be specified as a comma-separated list. |
| sort | string | No | Used to sort the result by a particular field. |
| cursor | string | No | Used for pagination, this opaque cursor will be returned in the `next` URL in the `Link` response header. Use the relative URL in the `Link` header to retrieve the `next` set of results. |
| limit | integer | No | Maximum number of spaces per result to return. If more results exist, use the `Link` response header to retrieve a relative URL that will return the next set of results. |

**Required OAuth Scopes (Forge):**

- `read:space:confluence`

**Response Formats:**

- **200:** Returned if the requested spaces are returned.
- **400:** Returned if an invalid request is provided.
- **401:** Returned if the authentication credentials are incorrect or missing
from the request.

**Permission Requirements:**

**[Permissions](https://confluence.atlassian.com/x/_AozKw) required**:
Only apps can make this request.
Permission to access the Confluence site ('Can use' global permission).
Only spaces that the app has permission to view will be returned.

---

