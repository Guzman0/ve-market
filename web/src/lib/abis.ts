// Minimal ABIs for Mezo contracts the app reads or writes.

export const veAbi = [
  {
    type: 'function', name: 'locked', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'amount', type: 'int128' },
        { name: 'end', type: 'uint256' },
        { name: 'isPermanent', type: 'bool' },
      ],
    }],
  },
  { type: 'function', name: 'escrowType', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'votingPowerOfNFT', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOfNFT', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'ownerToNFTokenIdList', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'getApproved', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  {
    type: 'function', name: 'isApprovedForAll', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [],
  },
  { type: 'function', name: 'voted', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'token', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

export const erc20PermitAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function', name: 'eip712Domain', stateMutability: 'view', inputs: [],
    outputs: [
      { name: 'fields', type: 'bytes1' }, { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      { name: 'salt', type: 'bytes32' }, { name: 'extensions', type: 'uint256[]' },
    ],
  },
] as const

export const priceFeedAbi = [
  { type: 'function', name: 'fetchPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

export const routerAbi = [
  {
    type: 'function', name: 'getAmountsOut', stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'routes', type: 'tuple[]', components: [
          { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
          { name: 'stable', type: 'bool' }, { name: 'factory', type: 'address' },
        ],
      },
    ],
    outputs: [{ type: 'uint256[]' }],
  },
] as const
