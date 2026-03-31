# Forge UI Kit Components Reference

This document provides comprehensive reference for all Forge UI Kit components, including props, usage examples, and best practices.

## Table of Contents
1. [UI Kit Overview](#ui-kit-overview)
2. [Form Components](#form-components)
3. [Layout Components](#layout-components)
4. [Data Display Components](#data-display-components)
5. [Feedback Components](#feedback-components)
6. [Navigation Components](#navigation-components)

---

## UI Kit Overview

### What is UI Kit?

Forge UI Kit is a collection of React components that:
- **Provide consistent UI** matching Atlassian products
- **Handle accessibility** automatically (ARIA labels, keyboard navigation)
- **Support theming** with automatic dark/light mode support
- **Enable responsive design** for different screen sizes

### Installation and Import

```javascript
// Install the package
npm install @forge/ui

// Import components you need
import { 
  Button,
  Form,
  TextField,
  Select,
  Checkbox,
  Stack,
  Layout
} from '@forge/ui';
```

---

## Form Components

### Form

The main container for form elements. Handles submission and validation.

```javascript
import { Form, Button, Stack } from '@forge/ui';

function MyForm() {
  const handleSubmit = async (formData) => {
    console.log('Form submitted:', formData);
    
    // Process the form data
    try {
      // Submit to backend
      await bridge.invoke('submitForm', { payload: formData });
      
      // Show success message
      showToast('Form submitted successfully!');
    } catch (error) {
      console.error('Submission error:', error);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Stack space="compact">
        <Button type="submit" appearance="primary">
          Submit Form
        </Button>
      </Stack>
    </Form>
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| onSubmit | Function | Yes | Callback when form is submitted |
| onChange | Function | No | Callback when form values change |
| onReset | Function | No | Callback when form is reset |
| validationMode | 'onSubmit' \| 'onChange' | No | When to validate (default: 'onSubmit') |

### TextField

Single-line text input field.

```javascript
import { Form, TextField, Stack } from '@forge/ui';

function UsernameField() {
  return (
    <Form>
      <Stack space="medium">
        <TextField
          name="username"
          label="Username"
          placeholder="Enter your username"
          isRequired={true}
          defaultValue="admin"
          maxLength={50}
          onChange={(e) => console.log('Changed:', e.target.value)}
        />
        
        {/* Password field */}
        <TextField
          name="password"
          label="Password"
          type="password"
          placeholder="Enter password"
          isRequired={true}
          minLength={8}
        />
      </Stack>
    </Form>
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Field name for form submission |
| label | string | Yes | Field label text |
| type | string | No | Input type (default: 'text') |
| placeholder | string | No | Placeholder text |
| isRequired | boolean | No | Whether field is required |
| defaultValue | any | No | Initial value |
| value | any | No | Controlled value |
| onChange | function | No | Change handler |
| validation | object | No | Validation rules |
| isInvalid | boolean | No | Whether field is invalid |

### TextArea

Multi-line text input field.

```javascript
import { Form, TextArea, Stack } from '@forge/ui';

function DescriptionField() {
  return (
    <Form>
      <Stack space="medium">
        <TextArea
          name="description"
          label="Description"
          placeholder="Enter description..."
          rows={5}
          maxLength={1000}
          isRequired={true}
          defaultValue=""
        />
        
        {/* Resize control */}
        <TextArea
          name="notes"
          label="Notes"
          resize="both" // none, vertical, horizontal, both
          minHeight={100}
        />
      </Stack>
    </Form>
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Field name |
| label | string | Yes | Field label |
| rows | number | No | Number of visible rows (default: 5) |
| cols | number | No | Number of visible columns |
| resize | string | No | Resize behavior ('none', 'vertical', etc.) |
| minLength | number | No | Minimum length |
| maxLength | number | No | Maximum length |

### Select

Dropdown select component.

```javascript
import { Form, Select, Stack } from '@forge/ui';

function PrioritySelect() {
  const priorities = [
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' }
  ];

  return (
    <Form>
      <Stack space="medium">
        {/* Single select */}
        <Select
          name="priority"
          label="Priority"
          options={priorities}
          defaultValue="medium"
          isRequired={true}
        />
        
        {/* Multi-select */}
        <Select
          name="assignees"
          label="Assignees"
          options={[
            { label: 'John Doe', value: 'john' },
            { label: 'Jane Smith', value: 'jane' }
          ]}
          isMulti={true}
          defaultValue={['john', 'jane']}
        />
      </Stack>
    </Form>
  );
}

// Async options
function ProjectSelect() {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    // Fetch projects from Jira API
    fetchProjects().then(projects => {
      setOptions(projects.map(p => ({
        label: p.name,
        value: p.id
      })));
    });
  }, []);

  return (
    <Select
      name="project"
      label="Project"
      options={options}
      isLoading={options.length === 0}
    />
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Field name |
| label | string | Yes | Field label |
| options | array | Yes | Array of {label, value} objects |
| isMulti | boolean | No | Whether multiple selections are allowed |
| defaultValue | any | No | Default selection(s) |
| isLoading | boolean | No | Show loading state |

### Checkbox

Single checkbox input.

```javascript
import { Form, Checkbox, Stack } from '@forge.ui';

function NotificationsForm() {
  return (
    <Form>
      <Stack space="medium">
        <Checkbox
          name="emailNotifications"
          label="Email notifications"
          defaultValue={true}
        />
        
        <Checkbox
          name="pushNotifications"
          label="Push notifications"
        />
        
        <Checkbox
          name="digest"
          label="Daily digest instead of instant emails"
          isDisabled={true}
        />
      </Stack>
    </Form>
  );
}

// Checkbox group
function PermissionsForm() {
  const [permissions, setPermissions] = useState({
    read: true,
    write: false,
    admin: false
  });

  return (
    <Form>
      <Stack space="medium">
        {['read', 'write', 'admin'].map((perm) => (
          <Checkbox
            key={perm}
            name={perm}
            label={` ${perm.charAt(0).toUpperCase() + perm.slice(1)} access`}
            onChange={(e) => {
              setPermissions(prev => ({
                ...prev,
                [perm]: e.target.checked
              }));
            }}
          />
        ))}
      </Stack>
    </Form>
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Field name |
| label | string | No | Checkbox label text |
| defaultValue | boolean | No | Initial checked state |
| value | boolean | No | Controlled value |
| onChange | function | No | Change handler |

### RadioGroup

Radio button group.

```javascript
import { Form, RadioGroup, Stack } from '@forge.ui';

function ViewModeForm() {
  const options = [
    { label: 'Board', value: 'board' },
    { label: 'List', value: 'list' },
    { label: 'Calendar', value: 'calendar' }
  ];

  return (
    <Form>
      <Stack space="medium">
        <RadioGroup
          name="viewMode"
          label="View Mode"
          options={options}
          defaultValue="board"
        />
        
        {/* Inline radio group */}
        <RadioGroup
          name="priority"
          label="Priority Level"
          options={[
            { label: 'Critical', value: 'critical' },
            { label: 'Important', value: 'important' },
            { label: 'Optional', value: 'optional' }
          ]}
          layout="horizontal" // horizontal or vertical
        />
      </Stack>
    </Form>
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| name | string | Yes | Field name |
| label | string | No | Group label text |
| options | array | Yes | Array of {label, value} objects |
| layout | 'horizontal' \| 'vertical' | No | Layout direction |

### Date/Time Pickers

```javascript
import { Form, DatePicker, TimePicker, Stack } from '@forge/ui';

function DateTimeForm() {
  return (
    <Form>
      <Stack space="medium">
        {/* Date picker */}
        <DatePicker
          name="startDate"
          label="Start Date"
          defaultValue={new Date()}
          minDate={new Date('2024-01-01')}
          maxDate={new Date('2024-12-31')}
          isRequired={true}
        />
        
        {/* Time picker */}
        <TimePicker
          name="startTime"
          label="Start Time"
          defaultValue="09:00"
        />
        
        {/* Date time picker */}
        <DatePicker
          name="appointment"
          label="Appointment Date/Time"
          includeTime={true}
          isRequired={true}
        />
      </Stack>
    </Form>
  );
}
```

---

## Layout Components

### Stack

Stacks components vertically or horizontally with consistent spacing.

```javascript
import { Form, TextField, Button, Stack } from '@forge/ui';

function StackedForm() {
  return (
    <Form onSubmit={() => console.log('Submitted')}>
      {/* Vertical stack - default */}
      <Stack space="medium">
        <TextField name="name" label="Name" />
        <TextField name="email" label="Email" />
        <Button type="submit">Submit</Button>
      </Stack>

      {/* Horizontal stack */}
      <Stack direction="row" space="compact">
        <TextField name="first" label="First" width="100px" />
        <TextField name="last" label="Last" width="100px" />
        <Button type="submit">Go</Button>
      </Stack>

      {/* With alignment */}
      <Stack direction="row" space="medium" align="center">
        <TextField name="search" label="Search" flex="auto" />
        <Button type="submit">Search</Button>
      </Stack>
    </Form>
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| direction | 'column' \| 'row' | No | Direction (default: 'column') |
| space | string | No | Spacing size ('none', 'compact', 'small', 'medium', etc.) |
| align | string | No | Alignment ('start', 'end', 'center', 'stretch') |

### Layout

Complex layout structure for building forms and views.

```javascript
import { Form, TextField, Select, Layout } from '@forge/ui';

function ComplexLayout() {
  return (
    <Form onSubmit={() => console.log('Submitted')}>
      {/* Full width */}
      <Layout>
        <TextField name="email" label="Email" width="100%" />
      </Layout>

      {/* Two column layout */}
      <Layout columns={2}>
        <TextField name="firstName" label="First Name" />
        <TextField name="lastName" label="Last Name" />
      </Layout>

      {/* Mixed sizes */}
      <Layout columns={[1, 2]}>
        <TextField name="email" label="Email" columnSpan={2} />
        <TextField name="phone" label="Phone" />
        <TextField name="fax" label="Fax" />
      </Layout>
    </Form>
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| columns | number \| array | No | Number of columns or column widths |

### Section

Content section with optional header and footer.

```javascript
import { Form, TextField, Textarea, Section } from '@forge/ui';

function SectionedForm() {
  return (
    <Form onSubmit={() => console.log('Submitted')}>
      <Section>
        {/* Header */}
        <h3>Personal Information</h3>
        
        {/* Body */}
        <TextField name="name" label="Name" />
        <TextField name="email" label="Email" />
        
        {/* Footer */}
        <p className="form-hint">Your personal contact information.</p>
      </Section>

      <Section>
        <h3>Additional Details</h3>
        <Textarea name="bio" label="Bio" rows={4} />
      </Section>
    </Form>
  );
}
```

### Card

Container component for grouping related content.

```javascript
import { Form, TextField, Card } from '@forge/ui';

function CardedForm() {
  return (
    <Form onSubmit={() => console.log('Submitted')}>
      <Card>
        <TextField name="title" label="Title" />
        <TextField name="description" label="Description" rows={4} />
      </Card>

      {/* Interactive card */}
      <Card interactive onClick={() => console.log('Clicked')}>
        <h3>Click me!</h3>
        <p>This card has click interaction enabled.</p>
      </Card>

      {/* With status indicator */}
      <Card>
        <TextField name="status" label="Status" />
      </Card>
    </Form>
  );
}
```

---

## Data Display Components

### Table

Data table component.

```javascript
import { Text, Card } from '@forge/ui';

function UsersTable() {
  const users = [
    { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Admin' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'User' }
  ];

  return (
    <Card>
      <h3>Users</h3>
      
      <table className="aui-table aui-table-striped">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>
                <span className={`role-badge role-${user.role.toLowerCase()}`}>
                  {user.role}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// With sorting
function SortableTable() {
  const [users, setUsers] = useState([
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
  ]);
  
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    
    const sortedUsers = [...users].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    setUsers(sortedUsers);
  };

  return (
    <Card>
      <table className="aui-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('name')}>Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
            <th onClick={() => handleSort('email')}>Email {sortConfig.key === 'email' && (sortConfig.direction === 'asc' ? '▲' : '▼')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
```

### List

Simple list component.

```javascript
import { Text, Card } from '@forge/ui';

function TaskList() {
  const tasks = [
    'Review code pull requests',
    'Update documentation',
    'Fix bug in authentication',
    'Add new feature'
  ];

  return (
    <Card>
      <h3>Tasks</h3>
      
      <ul className="aui-list">
        {tasks.map((task, index) => (
          <li key={index}>
            <input type="checkbox" />
            <span>{task}</span>
          </li>
        ))}
      </ul>

      {/* Ordered list */}
      <ol className="aui-list aui-list-ordered">
        {tasks.map((task, index) => (
          <li key={index}>{task}</li>
        ))}
      </ol>
    </Card>
  );
}
```

---

## Feedback Components

### Alert

Display important messages to users.

```javascript
import { Alert } from '@forge/ui';

function MyComponent() {
  return (
    <>
      {/* Success alert */}
      <Alert type="success">
        Your changes have been saved successfully.
      </Alert>

      {/* Warning alert */}
      <Alert type="warning" title="Warning">
        This action cannot be undone.
      </Alert>

      {/* Error alert */}
      <Alert type="error" title="Error">
        Failed to load data. Please try again later.
      </Alert>

      {/* Info alert */}
      <Alert type="info">
        New features are now available!
      </Alert>

      {/* Custom with icon */}
      <Alert 
        type="custom"
        icon={<span role="img" aria-label="info">ℹ️</span>}
      >
        This is a custom alert message.
      </Alert>
    </>
  );
}

// Dismissible alert
function DismissibleAlert() {
  const [show, setShow] = useState(true);

  if (!show) return null;

  return (
    <Alert 
      type="warning" 
      onClose={() => setShow(false)}
      title="Unsaved Changes"
    >
      You have unsaved changes. Are you sure you want to leave?
    </Alert>
  );
}
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| type | 'success' \| 'warning' \| 'error' \| 'info' \| 'custom' | No | Alert type (default: 'info') |
| onClose | function | No | Callback when closed |
| title | string | No | Alert title |

### Toast

Show temporary notifications.

```javascript
import { bridge } from '@forge/bridge';

function ToastExample() {
  const showToast = async (message, type = 'success') => {
    try {
      await bridge.configure({
        title: '',
        body: (
          <div className={`toast toast-${type}`}>
            <span>{message}</span>
          </div>
        ),
        width: '300px'
      });
      
      // Auto-close after 3 seconds
      setTimeout(async () => {
        try {
          await bridge.close();
        } catch (error) {
          console.error('Failed to close toast:', error);
        }
      }, 3000);
    } catch (error) {
      console.error('Failed to show toast:', error);
    }
  };

  return (
    <button onClick={() => showToast('Operation completed!')}>
      Show Toast
    </button>
  );
}
```

### Modal

Modal dialog component.

```javascript
import { Form, Button, Modal } from '@forge/ui';

function DeleteConfirmation() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button onClick={() => setShowModal(true)}>Delete Item</Button>

      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <h2>Delete Item?</h2>
          
          <p>Are you sure you want to delete this item? This action cannot be undone.</p>
          
          <Form onSubmit={async () => {
            await handleDelete();
            setShowModal(false);
          }}>
            <div className="modal-actions">
              <Button onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              
              <Button 
                type="submit" 
                appearance="primary"
                appearanceColor="critical"
              >
                Delete
              </Button>
            </div>
          </Form>
        </Modal>
      )}
    </>
  );
}
```

---

## Navigation Components

### Pagination

```javascript
import { Button } from '@forge/ui';

function Pagination({ page, totalPages, onPageChange }) {
  return (
    <nav className="pagination">
      <Button 
        onClick={() => onPageChange(page - 1)} 
        disabled={page === 1}
      >
        Previous
      </Button>
      
      <span>Page {page} of {totalPages}</span>
      
      <Button 
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
      >
        Next
      </Button>
    </nav>
  );
}

// Usage
function PaginatedList() {
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;
  
  return (
    <>
      {/* Your list content */}
      <Pagination 
        page={page} 
        totalPages={totalPages} 
        onPageChange={setPage}
      />
    </>
  );
}
```

### Tabs

```javascript
import { useState } from 'react';

function MyTabs() {
  const [activeTab, setActiveTab] = useState('details');

  return (
    <div className="tabs">
      <nav className="tabs-nav">
        <button 
          className={activeTab === 'details' ? 'active' : ''}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        
        <button 
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
        
        <button 
          className={activeTab === 'activity' ? 'active' : ''}
          onClick={() => setActiveTab('activity')}
        >
          Activity
        </button>
      </nav>

      <div className="tabs-content">
        {activeTab === 'details' && (
          <div className="tab-pane">Details content</div>
        )}
        
        {activeTab === 'settings' && (
          <div className="tab-pane">Settings content</div>
        )}
        
        {activeTab === 'activity' && (
          <div className="tab-pane">Activity content</div>
        )}
      </div>
    </div>
  );
}
```

---

## Best Practices

### Component Organization
1. **Keep forms simple** - Break complex forms into multiple steps
2. **Group related fields** - Use sections for logical groupings
3. **Use appropriate input types** - Date pickers for dates, selects for options

### Accessibility
1. **Always include labels** - Ensure every form field has a label
2. **Provide hints** - Add helper text where needed
3. **Error messages** - Clearly indicate what's wrong and how to fix it

### Performance
1. **Lazy load heavy components** - Only render when needed
2. **Use memoization** - Memoize expensive computations
3. **Optimize re-renders** - Use useCallback/useMemo appropriately

## Related Documentation

- [Bridge API Reference](./15-bridge-api-reference.md)
- [Resolver Patterns](./16-resolver-patterns.md)