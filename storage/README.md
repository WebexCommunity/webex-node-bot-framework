# Framework Storage Modules

This folder contains the storage modules that can optionally be used in Framework for the `bot.store()`, `bot.recall()` and `bot.forget()` methods.

If not specified, Framework will default to the "memory" module.

The mongo storage module also supports a `bot.writeMetric()` which allows bots to write metric data that can be used to track bot usage.  

See the 'memory.js' module for an example, and 'template.js' as a starting point in defining your own Storage module.
