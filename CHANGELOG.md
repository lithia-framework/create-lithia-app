# Changelog

All notable changes to create-lithia-app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note:** All versions prior to 2.1.2 were released for testing purposes and should not be used in production.

## [Unreleased]

### Added

- Nothing yet! Check back soon.

## [2.1.2] - 2024-09-29

### ⚠️ Breaking Changes

- **Template URLs Updated**: Template repositories have been moved to the `lithia-framework` organization. Existing projects will continue to work, but new projects will use the updated templates.
- **Template Branch Changed**: Templates now use the `v4.0.1` branch instead of `main` for better version consistency.

### Added

- **🎉 Complete CLI Refactoring**: Complete architectural overhaul of the CLI with improved maintainability and extensibility
  - Class-based architecture with clear separation of concerns
  - Custom error classes (`CLIError`, `ValidationError`) for better error handling
  - Enhanced logging system with structured output and visual prefixes
  - Centralized configuration management with `ConfigBuilder` and `ConfigValidator`
  - Improved type safety throughout the codebase with specific TypeScript types

- **✨ Enhanced Validation System**:
  - Centralized validators with `Validators` class
  - Better project name validation with clear error messages
  - Package manager validation with type guards
  - System dependency checking with `SystemChecker` class

- **✨ Improved User Experience**:
  - Better error messages with standardized format
  - Enhanced progress feedback with timing information
  - More intuitive command-line interface
  - Consistent visual output with color-coded messages

### Fixed

- **🐛 TypeScript Compilation**: Fixed TypeScript compilation issues and improved type safety
- **🐛 Error Handling**: Improved error handling and validation throughout the application
- **🐛 System Dependencies**: Better handling and checking of system dependencies (npm, yarn, pnpm, bun, git)
- **🐛 Build Process**: Resolved build configuration issues and improved output consistency

### Changed

- **Updated Template Configuration**:
  - Template URLs now point to `lithia-framework` organization
  - Template branch updated to `v4.0.1` for consistency with Lithia framework
  - Simplified template selection (removed drizzle and prisma templates for now)

- **Improved Code Organization**:
  - Refactored from functional to class-based architecture
  - Better separation of concerns with dedicated classes for different responsibilities
  - Enhanced code readability and maintainability

- **Updated Dependencies**: Updated internal dependencies for better performance and security

---

## How to Read This Changelog

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security vulnerabilities fixed
- **⚠️ Breaking Changes**: Changes that require code updates

---

## Links

- [All Releases](https://github.com/lithia-framework/create-lithia-app/releases)
- [Documentation](https://lithiajs.com)
- [Lithia Framework](https://github.com/lithia-framework/lithia)

---

**Legend:**

- 🎉 Major feature
- ✨ Minor feature
- 🐛 Bug fix
- ⚠️ Breaking change
- 📝 Documentation
- 🔒 Security fix
